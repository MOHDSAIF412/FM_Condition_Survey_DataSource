/**
 * Realistic Sample FM Condition Survey Data
 * Demonstrates multiple attached photos in single snags, Google Maps GPS coordinates, and departmental assignments.
 */

// SVG is XML: unescaped &, < or > in the caption text produce a malformed
// document that the browser refuses to decode, so the photo silently vanishes
// from the PDF and Excel reports.
function escapeXml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function generateSamplePhotoSvg(rawLabel, rawDefectText, color = '#dc2626', photoNum = 1, totalPhotos = 1) {
  const label = escapeXml(rawLabel);
  const defectText = escapeXml(rawDefectText);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" viewBox="0 0 600 400">
    <rect width="600" height="400" fill="#1e293b"/>
    <rect x="20" y="20" width="560" height="360" fill="#0f172a" stroke="#334155" stroke-width="2" rx="8"/>
    <circle cx="300" cy="170" r="55" fill="none" stroke="${color}" stroke-width="4" stroke-dasharray="6,6"/>
    <line x1="285" y1="170" x2="315" y2="170" stroke="${color}" stroke-width="3"/>
    <line x1="300" y1="155" x2="300" y2="185" stroke="${color}" stroke-width="3"/>
    
    <rect x="40" y="40" width="130" height="28" fill="${color}" rx="4"/>
    <text x="50" y="59" fill="#ffffff" font-family="sans-serif" font-size="13" font-weight="bold">DEFECT PHOTO</text>

    <rect x="440" y="40" width="120" height="28" fill="#0284c7" rx="4"/>
    <text x="500" y="59" fill="#ffffff" font-family="sans-serif" font-size="12" font-weight="bold" text-anchor="middle">PHOTO ${photoNum} OF ${totalPhotos}</text>

    <text x="300" y="260" fill="#f8fafc" font-family="sans-serif" font-size="19" font-weight="bold" text-anchor="middle">${label}</text>
    <text x="300" y="295" fill="#94a3b8" font-family="sans-serif" font-size="14" text-anchor="middle">${defectText}</text>
    <text x="40" y="355" fill="#64748b" font-family="sans-serif" font-size="11">FM INSPECTION CAMERA • GEO: 25.1856°N, 55.2678°E • TIME-STAMPED</text>
  </svg>`;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}

export const sampleSurveyData = {
  id: 'survey_sample_commercial_tower',
  title: 'Facility Condition & Snagging Assessment Report',
  facility: {
    facilityName: 'Old Grandstand',
    buildingName: 'Zone A - Old Grandstand',
    buildingCode: 'Zone A',
    address: 'Old Grandstand, Zone A, Abu Dhabi, United Arab Emirates',
    googleLocation: {
      address: 'Old Grandstand, Zone A, Abu Dhabi, United Arab Emirates',
      latitude: '24.443972',
      longitude: '54.375531',
      mapsUrl: 'https://maps.google.com/?q=24.443972,54.375531',
      description: 'DMS: 24°26\'38.3"N 54°22\'31.91"E (Zone A)'
    },
    clientName: 'Abu Dhabi Equestrian Club (ADEC)',
    facilityManager: 'Eng. Tariq Al-Mansoor',
    surveyorName: 'David H. Miller',
    surveyorCompany: 'Global FM Engineering & Integrity Consultants',
    surveyDate: '2026-09-02',
    weatherCondition: 'Dry, 38°C, Clear Sky',
    grossInternalArea: '28,500 sq.m',
    buildingAge: '11 Years',
    floorsCount: 'Main Stand + Stables Complex',
    scopeNotes: 'Multi-discipline mechanical, electrical, plumbing, civil, carpentry, painting, and life safety condition audit across facilities to benchmark capital expenditure (CapEx).'
  },
  items: [
    {
      id: 'item_1',
      department: 'HVAC',
      assetName: 'Chiller No. 2 (Centrifugal Water-Cooled)',
      location: 'Chiller Yard',
      priority: 1,
      defectDescription: 'Refrigerant R-134a line joint sweating with severe oil stains indicating continuous micro-leak. Condenser tube bundle shows excessive scaling and high head pressure alarm.',
      estimatedCost: 14500,
      quantity: 1,
      unit: 'Unit',
      photos: [
        {
          id: 'p1_1',
          name: 'Chiller_Leak_Joint.jpg',
          caption: 'Close-up: Refrigerant leak & oil staining at flange',
          dataUrl: generateSamplePhotoSvg('CHILLER NO. 2 REFRIGERANT LEAK', 'Close-up: Oil and gas seepage at flange seal', '#ef4444', 1, 3)
        },
        {
          id: 'p1_2',
          name: 'Chiller_Pressure_Gauge.jpg',
          caption: 'High condenser head pressure alarm on control panel',
          dataUrl: generateSamplePhotoSvg('CHILLER CONTROL PANEL ALARM', 'High condenser head pressure trip log', '#f97316', 2, 3)
        },
        {
          id: 'p1_3',
          name: 'Chiller_Wide_Overview.jpg',
          caption: 'Wide overview: Roof Plant Room Zone A installation',
          dataUrl: generateSamplePhotoSvg('CHILLER #2 OVERVIEW', 'Wide overview of chiller plant room installation', '#0284c7', 3, 3)
        }
      ]
    },
    {
      id: 'item_2',
      department: 'HVAC',
      assetName: 'Air Handling Unit (AHU-04)',
      location: 'Indoor Arena',
      priority: 3,
      defectDescription: 'Supply fan V-belts displaying moderate surface fraying and slackness. Secondary bag filters approaching recommended pressure drop differential.',
      estimatedCost: 2200,
      quantity: 1,
      unit: 'Unit',
      photos: []
    },
    {
      id: 'item_3',
      department: 'CIVIL',
      assetName: 'Flat Roof Waterproofing Membrane & Parapet',
      location: 'Old Grandstand',
      priority: 2,
      defectDescription: 'Bituminous capping sheet experiencing local debonding, membrane blistering, and ponding water around 2 rainwater outlet hoppers.',
      estimatedCost: 8800,
      quantity: 45,
      unit: 'sq.m',
      photos: [
        {
          id: 'p2',
          name: 'Roof_Ponding_Defect.jpg',
          caption: 'Debonded bituminous membrane & standing water',
          dataUrl: generateSamplePhotoSvg('ROOF WATERPROOFING BLISTER', 'Debonded bituminous membrane & standing water', '#d97706', 1, 1)
        }
      ]
    },
    {
      id: 'item_4',
      department: 'PAINTING',
      assetName: 'Common Area Corridor Wall Emulsion & Skirting Paint',
      location: '30 Stables / Shaikha Stable',
      priority: 3,
      defectDescription: 'Extensive paint peeling, scuff marks from trolley impact, and hairline shrinkage cracking along drywall partitions.',
      estimatedCost: 3200,
      quantity: 260,
      unit: 'sq.m',
      photos: [
        {
          id: 'p4_paint',
          name: 'Corridor_Paint_Peel.jpg',
          caption: 'Flaking paint and shrinkage cracking along corridor',
          dataUrl: generateSamplePhotoSvg('CORRIDOR WALL PAINT PEELING', 'Scuff marks, flaking paint, and shrinkage cracks', '#ec4899', 1, 1)
        }
      ]
    },
    {
      id: 'item_5',
      department: 'CARPENTRY',
      assetName: 'Main Lobby Timber Wall Paneling & Reception Desk Joinery',
      location: 'Maha Stable',
      priority: 2,
      defectDescription: 'Natural walnut veneer lifting along bottom 150mm due to mop water absorption. Kickboards detached at corner joints.',
      estimatedCost: 4200,
      quantity: 1,
      unit: 'Lobby Area',
      photos: [
        {
          id: 'p5_carpentry',
          name: 'Timber_Veneer_Damage.jpg',
          caption: 'Delamination of walnut veneer at kickboard',
          dataUrl: generateSamplePhotoSvg('TIMBER VENEER DELAMINATION', 'Water damage on reception joinery kickboards', '#b45309', 1, 1)
        }
      ]
    },
    {
      id: 'item_6',
      department: 'ELECTRICAL',
      assetName: 'Main Low Voltage Switchboard (MDB-01)',
      location: 'Transformer Room',
      priority: 2,
      defectDescription: 'Thermographic scan reveals breaker #6 busbar connection running at 68°C (18°C above ambient baseline), indicating loose connection.',
      estimatedCost: 3500,
      quantity: 1,
      unit: 'Switchboard',
      photos: [
        {
          id: 'p3',
          name: 'Thermal_Hotspot_MDB.jpg',
          caption: 'Infrared hotspot 68°C on 630A breaker connection',
          dataUrl: generateSamplePhotoSvg('MDB BUSBAR THERMAL HOTSPOT', '68°C hotspot on 630A circuit breaker feed', '#f97316', 1, 1)
        }
      ]
    },
    {
      id: 'item_7',
      department: 'FIRE_SAFETY',
      assetName: 'Emergency Staircase Fire Doors (FD-60)',
      location: 'Service Block',
      priority: 1,
      defectDescription: 'Level 3 fire door self-closer arm detached. Intumescent smoke seals missing on Level 7 door frame. Doors fail to latch closed automatically.',
      estimatedCost: 4800,
      quantity: 3,
      unit: 'Door Sets',
      photos: [
        {
          id: 'p4_1',
          name: 'Defective_Fire_Door_Closer.jpg',
          caption: 'Level 3: Hydraulic door closer arm unhooked',
          dataUrl: generateSamplePhotoSvg('FIRE DOOR CLOSER DETACHED', 'Closer arm detached, door does not latch', '#dc2626', 1, 2)
        },
        {
          id: 'p4_2',
          name: 'Missing_Smoke_Seal.jpg',
          caption: 'Level 7: Missing intumescent fire perimeter seal',
          dataUrl: generateSamplePhotoSvg('MISSING INTUMESCENT SEAL', 'Seal missing along top and latch rebate', '#ef4444', 2, 2)
        }
      ]
    },
    {
      id: 'item_8',
      department: 'PLUMBING',
      assetName: 'Domestic Water Booster Pump Skid',
      location: 'Quarantine AC/Non-AC Stable',
      priority: 2,
      defectDescription: 'Pump #3 mechanical gland seal weeping clean water. Pressure gauge indicator glass cracked and unreadable.',
      estimatedCost: 1950,
      quantity: 1,
      unit: 'Pump Set',
      photos: []
    }
  ],
  signatures: {
    surveyor: {
      name: 'David H. Miller',
      date: '2026-09-02',
      signatureData: ''
    },
    client: {
      name: 'Eng. Tariq Al-Mansoor',
      date: '2026-09-02',
      signatureData: ''
    }
  },
  generalNotes: 'Overall the facility is operational; prompt remediation of Priority 1 life safety fire doors and the Chiller 2 refrigerant leak is critical. Work orders are assigned directly to HVAC, Carpentry, Painting, Electrical, and Civil maintenance teams.',
  updatedAt: new Date().toISOString()
};
