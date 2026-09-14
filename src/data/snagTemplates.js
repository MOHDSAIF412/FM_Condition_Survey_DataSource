/**
 * Common condition-survey defects, ready to tap instead of type.
 *
 * Priorities follow PRIORITY_LEVELS: 1 is a safety or critical-operations
 * hazard, 2 prevents a secondary failure, 3 is desirable, 4 is lifecycle wear.
 * They are a sensible starting point, not a verdict -- the surveyor changes
 * them on the card like any other field.
 *
 * Costs are deliberately absent. A remediation price depends on the site,
 * the contract and the year, so a made-up figure here would travel straight
 * into a client's CapEx report as though someone had estimated it.
 */
export const SNAG_TEMPLATES = [
  // HVAC & Mechanical
  { id: 't_hvac_1', department: 'HVAC', priority: 2, unit: 'Unit', description: 'AHU filters heavily soiled and overdue replacement' },
  { id: 't_hvac_2', department: 'HVAC', priority: 2, unit: 'Unit', description: 'Chilled water pipework insulation damaged, condensation forming' },
  { id: 't_hvac_3', department: 'HVAC', priority: 3, unit: 'No.', description: 'Air grille / diffuser soiled and discoloured' },
  { id: 't_hvac_4', department: 'HVAC', priority: 1, unit: 'Unit', description: 'FCU drain pan overflowing, water damage to ceiling below' },
  { id: 't_hvac_5', department: 'HVAC', priority: 2, unit: 'Unit', description: 'Excessive noise and vibration from fan unit in operation' },
  { id: 't_hvac_6', department: 'HVAC', priority: 3, unit: 'Unit', description: 'Thermostat not responding / out of calibration' },
  { id: 't_hvac_7', department: 'HVAC', priority: 4, unit: 'Unit', description: 'Split unit beyond economic life, recommend lifecycle replacement' },

  // Electrical & Power
  { id: 't_elec_1', department: 'ELECTRICAL', priority: 1, unit: 'No.', description: 'Exposed live conductors / missing socket faceplate' },
  { id: 't_elec_2', department: 'ELECTRICAL', priority: 1, unit: 'No.', description: 'Distribution board missing blanking plates, live parts accessible' },
  { id: 't_elec_3', department: 'ELECTRICAL', priority: 3, unit: 'No.', description: 'Light fitting not operational, lamp failed' },
  { id: 't_elec_4', department: 'ELECTRICAL', priority: 2, unit: 'No.', description: 'Distribution board circuit schedule missing or illegible' },
  { id: 't_elec_5', department: 'ELECTRICAL', priority: 2, unit: 'm', description: 'Cable containment / trunking damaged and unsupported' },
  { id: 't_elec_6', department: 'ELECTRICAL', priority: 1, unit: 'No.', description: 'Emergency light failed on test, no illumination on power loss' },
  { id: 't_elec_7', department: 'ELECTRICAL', priority: 3, unit: 'No.', description: 'Socket outlet loose in wall / damaged housing' },

  // Plumbing & Public Health
  { id: 't_plumb_1', department: 'PLUMBING', priority: 2, unit: 'No.', description: 'Active leak at pipe joint, staining to surrounding finishes' },
  { id: 't_plumb_2', department: 'PLUMBING', priority: 3, unit: 'No.', description: 'Tap / mixer dripping continuously' },
  { id: 't_plumb_3', department: 'PLUMBING', priority: 2, unit: 'No.', description: 'Floor drain blocked, standing water in wet area' },
  { id: 't_plumb_4', department: 'PLUMBING', priority: 3, unit: 'No.', description: 'WC cistern running / not shutting off' },
  { id: 't_plumb_5', department: 'PLUMBING', priority: 3, unit: 'm', description: 'Sanitary silicone sealant mouldy and perished' },
  { id: 't_plumb_6', department: 'PLUMBING', priority: 2, unit: 'No.', description: 'Water heater showing corrosion at connections' },

  // Fire & Life Safety
  { id: 't_fire_1', department: 'FIRE_SAFETY', priority: 1, unit: 'No.', description: 'Fire extinguisher missing from designated point' },
  { id: 't_fire_2', department: 'FIRE_SAFETY', priority: 1, unit: 'No.', description: 'Fire extinguisher inspection tag expired' },
  { id: 't_fire_3', department: 'FIRE_SAFETY', priority: 1, unit: 'No.', description: 'Fire exit obstructed / escape route blocked by stored items' },
  { id: 't_fire_4', department: 'FIRE_SAFETY', priority: 1, unit: 'No.', description: 'Fire door will not self-close onto latch' },
  { id: 't_fire_5', department: 'FIRE_SAFETY', priority: 1, unit: 'No.', description: 'Exit signage missing, damaged or not illuminated' },
  { id: 't_fire_6', department: 'FIRE_SAFETY', priority: 1, unit: 'No.', description: 'Smoke detector missing from ceiling mount' },
  { id: 't_fire_7', department: 'FIRE_SAFETY', priority: 2, unit: 'No.', description: 'Fire-stopping absent at service penetration through compartment wall' },
  { id: 't_fire_8', department: 'FIRE_SAFETY', priority: 2, unit: 'No.', description: 'Sprinkler head obstructed / painted over' },

  // Civil & Masonry
  { id: 't_civil_1', department: 'CIVIL', priority: 2, unit: 'm', description: 'Cracking to blockwork wall, monitor and make good' },
  { id: 't_civil_2', department: 'CIVIL', priority: 3, unit: 'No.', description: 'Floor tile cracked / drummy underfoot' },
  { id: 't_civil_3', department: 'CIVIL', priority: 2, unit: 'm²', description: 'Spalling concrete with exposed reinforcement, corrosion evident' },
  { id: 't_civil_4', department: 'CIVIL', priority: 1, unit: 'm', description: 'Trip hazard from uneven paving / settled slab' },
  { id: 't_civil_5', department: 'CIVIL', priority: 3, unit: 'm²', description: 'Ceiling tile water-stained and sagging' },
  { id: 't_civil_6', department: 'CIVIL', priority: 2, unit: 'm', description: 'External expansion joint sealant perished' },
  { id: 't_civil_7', department: 'CIVIL', priority: 2, unit: 'm²', description: 'Waterproofing failure, damp ingress to internal finishes' },

  // Painting & Decorating
  { id: 't_paint_1', department: 'PAINTING', priority: 3, unit: 'm²', description: 'Paint finish flaking and peeling from wall surface' },
  { id: 't_paint_2', department: 'PAINTING', priority: 3, unit: 'm²', description: 'Wall surface scuffed and marked, redecoration required' },
  { id: 't_paint_3', department: 'PAINTING', priority: 2, unit: 'm²', description: 'Rust staining / corrosion bleeding through painted metalwork' },
  { id: 't_paint_4', department: 'PAINTING', priority: 3, unit: 'm²', description: 'Water staining to ceiling finish following historic leak' },
  { id: 't_paint_5', department: 'PAINTING', priority: 4, unit: 'm²', description: 'External paintwork faded and chalking from UV exposure' },

  // Carpentry & Joinery
  { id: 't_carp_1', department: 'CARPENTRY', priority: 3, unit: 'No.', description: 'Door closer faulty, door slamming or not closing' },
  { id: 't_carp_2', department: 'CARPENTRY', priority: 3, unit: 'No.', description: 'Door leaf damaged / delaminating at base' },
  { id: 't_carp_3', department: 'CARPENTRY', priority: 3, unit: 'No.', description: 'Ironmongery loose, missing screws to hinges or handle' },
  { id: 't_carp_4', department: 'CARPENTRY', priority: 3, unit: 'No.', description: 'Cabinet door / drawer misaligned and binding' },
  { id: 't_carp_5', department: 'CARPENTRY', priority: 2, unit: 'No.', description: 'Timber showing rot / termite damage' },
  { id: 't_carp_6', department: 'CARPENTRY', priority: 3, unit: 'm', description: 'Skirting detached from wall' },

  // Security & Access Control
  { id: 't_sec_1', department: 'SECURITY', priority: 2, unit: 'No.', description: 'Access control reader not responding to valid card' },
  { id: 't_sec_2', department: 'SECURITY', priority: 2, unit: 'No.', description: 'CCTV camera offline / no image at recorder' },
  { id: 't_sec_3', department: 'SECURITY', priority: 3, unit: 'No.', description: 'CCTV camera lens dirty, view obscured' },
  { id: 't_sec_4', department: 'SECURITY', priority: 1, unit: 'No.', description: 'External door not securing, lock defective' },
  { id: 't_sec_5', department: 'SECURITY', priority: 3, unit: 'm', description: 'Perimeter fencing damaged' },

  // General FM & Cleaning
  { id: 't_gen_1', department: 'GENERAL', priority: 3, unit: 'No.', description: 'General housekeeping poor, area requires deep clean' },
  { id: 't_gen_2', department: 'GENERAL', priority: 3, unit: 'No.', description: 'Waste accumulation in plant room / service area' },
  { id: 't_gen_3', department: 'GENERAL', priority: 2, unit: 'No.', description: 'Plant room access restricted by stored materials' },
  { id: 't_gen_4', department: 'GENERAL', priority: 3, unit: 'No.', description: 'Signage missing, damaged or out of date' },
  { id: 't_gen_5', department: 'GENERAL', priority: 4, unit: 'No.', description: 'Fixture at end of serviceable life, plan replacement' },
  { id: 't_gen_6', department: 'GENERAL', priority: 2, unit: 'No.', description: 'Pest activity evident, treatment required' }
];
