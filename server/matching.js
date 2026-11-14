// Intelligent Hospital Matching Engine for CareBridge

const SERVICE_TAG_MAP = {
  'Trauma assessment': ['Trauma', 'Emergency'],
  'Cardiac evaluation': ['Cardiac', 'CathLab'],
  'Orthopaedic consult': ['Orthopaedic', 'Surgery'],
  'Neurology assessment': ['Neuro', 'Stroke'],
  'ICU admission review': ['ICU', 'Critical Care'],
  'General emergency': ['General', 'Emergency'],
};

export function evaluateHospitalMatch(request, hospital) {
  const service = request.service_type || 'General emergency';
  const urgency = request.urgency || 'Medium';
  const hospitalTags = hospital.tags || [];

  // 1. Specialty & Capability Alignment (0-100)
  const requiredTags = SERVICE_TAG_MAP[service] || ['General'];
  let capabilityMatch = 40; // Base baseline for certified hospitals
  const hasExact = requiredTags.some(tag => hospitalTags.includes(tag));
  if (hasExact) {
    capabilityMatch = 95;
  } else if (hospitalTags.includes('General')) {
    capabilityMatch = 65;
  }

  // 2. Resource & Bed Availability (0-100)
  const bedsAvail = Number(hospital.general_beds_available ?? hospital.beds ?? 0);
  const icuAvail = Number(hospital.icu_beds_available ?? hospital.icu ?? 0);
  const specialists = Number(hospital.specialists_count ?? hospital.specialists ?? 0);

  let bedScore = 50;
  if (urgency === 'Critical') {
    if (icuAvail >= 3) bedScore = 95;
    else if (icuAvail >= 1) bedScore = 75;
    else bedScore = 15; // Severe penalty for zero ICU on critical case
  } else {
    if (bedsAvail >= 10) bedScore = 95;
    else if (bedsAvail >= 5) bedScore = 80;
    else if (bedsAvail >= 1) bedScore = 55;
    else bedScore = 20;
  }

  // 3. Specialist coverage (0-100)
  const specialistScore = Math.min(100, Math.round(specialists * 10));

  // 4. Distance & Proximity (0-100)
  const dist = Number(hospital.distance_km || 5.0);
  const distanceScore = Math.max(20, Math.min(100, Math.round(100 - (dist * 5.5))));

  // Weightings based on Urgency
  let weights;
  if (urgency === 'Critical') {
    weights = { cap: 0.35, res: 0.35, dist: 0.20, spec: 0.10 };
  } else if (urgency === 'High') {
    weights = { cap: 0.35, res: 0.30, dist: 0.25, spec: 0.10 };
  } else {
    weights = { cap: 0.30, res: 0.25, dist: 0.35, spec: 0.10 };
  }

  // Composite Calculation
  let rawScore =
    (capabilityMatch * weights.cap) +
    (bedScore * weights.res) +
    (distanceScore * weights.dist) +
    (specialistScore * weights.spec);

  // Status Penalty
  if (hospital.status === 'At capacity' || (bedsAvail === 0 && icuAvail === 0)) {
    rawScore = Math.min(rawScore, 58);
  } else if (hospital.status === 'Limited') {
    rawScore = Math.min(rawScore, 89);
  }

  const finalScore = Math.min(99, Math.max(25, Math.round(rawScore)));

  // Recommendation rationale
  let rationale = [];
  if (hasExact) rationale.push(`Primary capability match: ${requiredTags[0]}`);
  if (urgency === 'Critical' && icuAvail > 0) rationale.push(`${icuAvail} ICU beds ready`);
  if (dist < 4.0) rationale.push(`Rapid transit: ${dist} km`);
  if (bedsAvail > 8) rationale.push(`High bed availability (${bedsAvail})`);
  if (hospital.status === 'At capacity') rationale.push('Warning: Facility reports high saturation');

  return {
    hospitalId: hospital.id,
    hospitalName: hospital.name,
    shortName: hospital.short_name || hospital.short,
    area: hospital.area,
    distanceKm: dist,
    score: finalScore,
    capabilityMatch,
    bedScore,
    distanceScore,
    bedsAvailable: bedsAvail,
    icuAvailable: icuAvail,
    specialists,
    status: hospital.status,
    rationale: rationale.join(' • ') || 'Standard regional emergency facility'
  };
}

export function rankHospitalsForRequest(request, hospitals) {
  return hospitals
    .map(h => evaluateHospitalMatch(request, h))
    .sort((a, b) => b.score - a.score);
}
