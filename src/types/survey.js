/**
 * Standard FM Condition Survey Definitions and Types
 */

export const PRIORITY_LEVELS = {
  1: {
    level: 1,
    label: 'Priority 1 (Urgent)',
    timeframe: 'Immediate / within 1-3 months',
    description: 'Health, life safety, security, or critical operational hazard.',
    badge: 'bg-red-600 text-white border-red-700'
  },
  2: {
    level: 2,
    label: 'Priority 2 (Essential)',
    timeframe: 'Within 1-2 years',
    description: 'Essential repairs to prevent secondary structural or system failure.',
    badge: 'bg-orange-500 text-white border-orange-600'
  },
  3: {
    level: 3,
    label: 'Priority 3 (Desirable)',
    timeframe: 'Within 3-5 years',
    description: 'Desirable improvements to improve efficiency or aesthetic value.',
    badge: 'bg-amber-500 text-white border-amber-600'
  },
  4: {
    level: 4,
    label: 'Priority 4 (Long Term)',
    timeframe: '5+ years',
    description: 'Long-term lifecycle replacement or minor aesthetic wear.',
    badge: 'bg-blue-500 text-white border-blue-600'
  }
};

export const DEPARTMENTS = {
  HVAC: {
    id: 'HVAC',
    name: 'HVAC & Mechanical',
    icon: 'Fan',
    color: '#0284c7', // Sky blue
    badge: 'bg-sky-100 text-sky-800 border-sky-300',
    badgeSolid: 'bg-sky-600 text-white'
  },
  ELECTRICAL: {
    id: 'ELECTRICAL',
    name: 'Electrical & Power',
    icon: 'Zap',
    color: '#eab308', // Amber
    badge: 'bg-amber-100 text-amber-800 border-amber-300',
    badgeSolid: 'bg-amber-600 text-white'
  },
  CARPENTRY: {
    id: 'CARPENTRY',
    name: 'Carpentry & Joinery',
    icon: 'Hammer',
    color: '#b45309', // Wood brown
    badge: 'bg-amber-100 text-amber-900 border-amber-400',
    badgeSolid: 'bg-amber-800 text-white'
  },
  PAINTING: {
    id: 'PAINTING',
    name: 'Painting & Decorating',
    icon: 'Paintbrush',
    color: '#ec4899', // Pink
    badge: 'bg-pink-100 text-pink-800 border-pink-300',
    badgeSolid: 'bg-pink-600 text-white'
  },
  CIVIL: {
    id: 'CIVIL',
    name: 'Civil & Masonry',
    icon: 'BrickWall',
    color: '#64748b', // Slate
    badge: 'bg-slate-100 text-slate-800 border-slate-300',
    badgeSolid: 'bg-slate-600 text-white'
  },
  PLUMBING: {
    id: 'PLUMBING',
    name: 'Plumbing & Public Health',
    icon: 'Droplets',
    color: '#06b6d4', // Cyan
    badge: 'bg-cyan-100 text-cyan-800 border-cyan-300',
    badgeSolid: 'bg-cyan-600 text-white'
  },
  FIRE_SAFETY: {
    id: 'FIRE_SAFETY',
    name: 'Fire & Life Safety',
    icon: 'ShieldAlert',
    color: '#dc2626', // Red
    badge: 'bg-rose-100 text-rose-800 border-rose-300',
    badgeSolid: 'bg-rose-600 text-white'
  },
  SECURITY: {
    id: 'SECURITY',
    name: 'Security & Access Control',
    icon: 'Lock',
    color: '#6366f1', // Indigo
    badge: 'bg-indigo-100 text-indigo-800 border-indigo-300',
    badgeSolid: 'bg-indigo-600 text-white'
  },
  GENERAL: {
    id: 'GENERAL',
    name: 'General FM & Cleaning',
    icon: 'Wrench',
    color: '#475569',
    badge: 'bg-slate-100 text-slate-700 border-slate-200',
    badgeSolid: 'bg-slate-700 text-white'
  }
};

export const DEFAULT_CATEGORIES = [
  { id: 'cat_fabric', name: 'Building Fabric & Architecture', icon: 'Building2' },
  { id: 'cat_hvac', name: 'HVAC & Mechanical Systems', icon: 'Fan' },
  { id: 'cat_elec', name: 'Electrical & Power Systems', icon: 'Zap' },
  { id: 'cat_plumb', name: 'Plumbing & Public Health', icon: 'Droplets' },
  { id: 'cat_fire', name: 'Fire & Life Safety Systems', icon: 'ShieldAlert' },
  { id: 'cat_external', name: 'External Grounds & Civil', icon: 'Trees' }
];

export function createDefaultAsset(location = '', department = 'HVAC') {
  return {
    id: 'item_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
    assetName: '',
    department: department || 'HVAC',
    location: location || '',
    priority: 2,
    defectDescription: '',
    estimatedCost: 0,
    quantity: 1,
    unit: 'Unit',
    photos: []
  };
}

export function createNewSurvey() {
  return {
    id: 'survey_' + Date.now(),
    title: 'Facility Condition Assessment',
    facility: {
      facilityName: '',
      buildingName: '',
      buildingCode: '',
      address: '',
      googleLocation: {
        address: '',
        latitude: '',
        longitude: '',
        mapsUrl: '',
        description: ''
      },
      clientName: '',
      facilityManager: '',
      surveyorName: '',
      surveyorCompany: '',
      surveyDate: new Date().toISOString().split('T')[0],
      weatherCondition: 'Clear / Dry',
      grossInternalArea: '',
      buildingAge: '',
      floorsCount: '',
      scopeNotes: 'Visual snagging and condition survey of mechanical, electrical, civil, painting, carpentry, and safety building components.'
    },
    items: [
      createDefaultAsset('') // Default will be one asset!
    ],
    signatures: {
      surveyor: { name: '', date: new Date().toISOString().split('T')[0], signatureData: '' },
      client: { name: '', date: new Date().toISOString().split('T')[0], signatureData: '' }
    },
    generalNotes: '',
    updatedAt: new Date().toISOString()
  };
}

export function calculateSurveyStats(items = []) {
  const total = items.length;
  if (total === 0) {
    return {
      total: 0,
      priorityCounts: { 1: 0, 2: 0, 3: 0, 4: 0 },
      departmentStats: {},
      locationStats: {},
      totalCost: 0,
      totalPhotos: 0
    };
  }

  const priorityCounts = { 1: 0, 2: 0, 3: 0, 4: 0 };
  const departmentStats = {};
  const locationStats = {};
  let totalCost = 0;
  let totalPhotos = 0;

  // Initialize department stats
  Object.keys(DEPARTMENTS).forEach((deptKey) => {
    departmentStats[deptKey] = {
      id: deptKey,
      name: DEPARTMENTS[deptKey].name,
      count: 0,
      cost: 0
    };
  });

  items.forEach((item) => {
    if (priorityCounts[item.priority] !== undefined) {
      priorityCounts[item.priority]++;
    }
    const cost = parseFloat(item.estimatedCost) || 0;
    totalCost += cost;
    totalPhotos += (item.photos || []).length;

    // Department breakdown
    const deptKey = item.department || 'GENERAL';
    if (!departmentStats[deptKey]) {
      departmentStats[deptKey] = {
        id: deptKey,
        name: DEPARTMENTS[deptKey]?.name || deptKey,
        count: 0,
        cost: 0
      };
    }
    departmentStats[deptKey].count++;
    departmentStats[deptKey].cost += cost;

    // Location breakdown
    const locName = item.location || 'Unassigned Location';
    if (!locationStats[locName]) {
      locationStats[locName] = { name: locName, count: 0, cost: 0 };
    }
    locationStats[locName].count++;
    locationStats[locName].cost += cost;
  });

  return {
    total,
    priorityCounts,
    departmentStats,
    locationStats,
    totalCost,
    totalPhotos
  };
}
