import artgData from '../data/artg-medications.json';

export type PregnancyCategory = 'A' | 'B1' | 'B2' | 'B3' | 'C' | 'D' | 'X';

export type ArtgMedication = {
  id: string;
  name: string;
  brand: string;
  generic: string;
  strength: string;
  form: string;
  pbs: boolean;
  maxPbsRepeats: number;
  schedule: 'S4' | 'S8' | 'S2' | 'S3';
  drugClass: string;
  category: string;
  indication?: string;
  mechanismOfAction?: string;
  pbsListingType?: 'General' | 'Restricted Benefit' | 'Authority Required' | 'Non-PBS';
  pbsRestrictionNote?: string;
  pregnancyCategory?: PregnancyCategory;
  counselingAdvice?: string;
  cautionsAndContraindications?: string;
  adverseEffects?: string;
  monitoringAdvice?: string;
  storageAdvice?: string;
  safeScriptMonitored?: boolean;
  defaultDose: string;
  defaultFrequency: string;
  defaultDirections: string;
  defaultRepeats: number;
  commonDoses?: Array<{
    label: string;
    dose: string;
    frequency: string;
    directions: string;
    repeats?: number;
  }>;
  warningNote?: string | null;
};

export const ARTG_MEDICATIONS: ArtgMedication[] = artgData as ArtgMedication[];

/** Helper to look up an ARTG medication by ID */
export function getArtgMedicationById(id: string): ArtgMedication | undefined {
  return ARTG_MEDICATIONS.find((m) => m.id === id);
}

/** Get list of unique categories available in the catalog */
export function getDistinctCategories(): string[] {
  return Array.from(new Set(ARTG_MEDICATIONS.map((m) => m.category))).sort();
}

export type SearchArtgOptions = {
  category?: string;
  schedule?: string;
  pbsOnly?: boolean;
  limit?: number;
};

/** Search Australian Register of Therapeutic Goods prescribable medicines */
export function searchArtgMedications(
  query: string,
  options?: SearchArtgOptions | number
): ArtgMedication[] {
  const opts: SearchArtgOptions =
    typeof options === 'number' ? { limit: options } : options || {};
  const limit = opts.limit ?? 25;
  const q = query.trim().toLowerCase();

  let pool = ARTG_MEDICATIONS;

  if (opts.category && opts.category !== 'All') {
    pool = pool.filter((m) => m.category === opts.category);
  }

  if (opts.schedule && opts.schedule !== 'All') {
    pool = pool.filter((m) => m.schedule === opts.schedule);
  }

  if (opts.pbsOnly) {
    pool = pool.filter((m) => m.pbs);
  }

  if (!q) {
    return pool.slice(0, limit);
  }

  const tokens = q.split(/\s+/).filter(Boolean);

  const results = pool.filter((med) => {
    const haystack = `${med.brand} ${med.generic} ${med.name} ${med.strength} ${med.form} ${med.category} ${med.drugClass} ${med.indication ?? ''}`.toLowerCase();
    return tokens.every((token) => haystack.includes(token));
  });

  // Rank exact brand or generic prefix matches first
  results.sort((a, b) => {
    const aBrandMatch = a.brand.toLowerCase().startsWith(q);
    const bBrandMatch = b.brand.toLowerCase().startsWith(q);
    if (aBrandMatch && !bBrandMatch) return -1;
    if (!aBrandMatch && bBrandMatch) return 1;

    const aGenericMatch = a.generic.toLowerCase().startsWith(q);
    const bGenericMatch = b.generic.toLowerCase().startsWith(q);
    if (aGenericMatch && !bGenericMatch) return -1;
    if (!aGenericMatch && bGenericMatch) return 1;

    return a.name.localeCompare(b.name);
  });

  return results.slice(0, limit);
}

/**
 * TGA Pregnancy Categorisation definitions with clinical recommendations.
 */
export function getPregnancyDescription(category?: PregnancyCategory | string): {
  badgeClass: string;
  severity: 'safe' | 'caution' | 'danger';
  title: string;
  detail: string;
} {
  switch (category) {
    case 'A':
      return {
        badgeClass: 'preg-cat-a',
        severity: 'safe',
        title: 'Category A — Well-established safety in pregnancy',
        detail:
          'Taken by a large number of pregnant women without proven increase in fetal malformations or harmful effects.',
      };
    case 'B1':
      return {
        badgeClass: 'preg-cat-b1',
        severity: 'caution',
        title: 'Category B1 — Limited human data; animal studies reassuring',
        detail:
          'Limited human pregnancy data. Animal studies show no evidence of fetal damage.',
      };
    case 'B2':
      return {
        badgeClass: 'preg-cat-b2',
        severity: 'caution',
        title: 'Category B2 — Limited human and animal data',
        detail:
          'Limited human data. Animal studies inadequate/lacking but available data show no fetal harm.',
      };
    case 'B3':
      return {
        badgeClass: 'preg-cat-b3',
        severity: 'caution',
        title: 'Category B3 — Animal fetal findings; human significance uncertain',
        detail:
          'Limited human data. Animal studies show evidence of increased fetal damage, significance in humans uncertain. Use with specialist care.',
      };
    case 'C':
      return {
        badgeClass: 'preg-cat-c',
        severity: 'caution',
        title: 'Category C — Pharmacological adverse effects on fetus',
        detail:
          'Owing to pharmacological effects, has caused or suspected of causing reversible harmful effects on the fetus (without malformations). Caution required.',
      };
    case 'D':
      return {
        badgeClass: 'preg-cat-d',
        severity: 'danger',
        title: 'Category D — Known or suspected fetal malformations/damage',
        detail:
          'Known or suspected to cause increased incidence of human fetal malformations or irreversible damage. Only use if benefits outweigh maternal life-threatening risks.',
      };
    case 'X':
      return {
        badgeClass: 'preg-cat-x',
        severity: 'danger',
        title: 'Category X — STRICTLY CONTRAINDICATED in pregnancy',
        detail:
          'High risk of causing permanent severe fetal damage. Strictly contraindicated in pregnancy or women planning pregnancy.',
      };
    default:
      return {
        badgeClass: 'preg-cat-unknown',
        severity: 'caution',
        title: 'Pregnancy Category Not Specified',
        detail: 'Consult the Australian Medicines Handbook (AMH) or TGA PI for pregnancy safety data.',
      };
  }
}

/**
 * Automatically determine PBS subsidised vs Non-PBS status
 * based on Australian Pharmaceutical Benefits Scheme (PBS) listing and repeats count.
 */
export function calculateSmartPbs(
  med: ArtgMedication | null,
  repeats: number
): { isPbs: boolean; reason: string; exceedsMax: boolean } {
  // If custom/off-list medicine
  if (!med) {
    return {
      isPbs: true,
      reason: 'Custom medicine (Standard PBS eligibility assumes clinician authority)',
      exceedsMax: false,
    };
  }

  // If drug is explicitly not listed on PBS (Private prescription)
  if (!med.pbs) {
    return {
      isPbs: false,
      reason: 'Non-PBS / Private Prescription (Medicine is not subsidised on Australian PBS)',
      exceedsMax: false,
    };
  }

  const maxAllowed = typeof med.maxPbsRepeats === 'number' ? med.maxPbsRepeats : 5;

  // If repeats exceed the standard PBS maximum for this medication
  if (repeats > maxAllowed) {
    return {
      isPbs: false,
      reason: `Exceeds standard PBS maximum of ${maxAllowed} repeat${maxAllowed === 1 ? '' : 's'}. Marked as Private / Non-PBS (or requires special PBS Authority approval).`,
      exceedsMax: true,
    };
  }

  // Within standard PBS limit
  return {
    isPbs: true,
    reason: `PBS Subsidised Prescription (Standard max: ${maxAllowed} repeats)`,
    exceedsMax: false,
  };
}


/**
 * Extract distinct clinical indication tags / uses from an ArtgMedication's indication text or drug class.
 */
export function getClinicalUses(med: ArtgMedication | null): string[] {
  if (!med) return [];
  const uses: string[] = [];

  if (med.indication) {
    const parts = med.indication
      .split(/[,;•]|\b(?:as well as|and treatment of|and for)\b/i)
      .map((s) => s.trim())
      .filter((s) => s.length > 2 && s.length < 75);

    for (const p of parts) {
      const clean = p
        .replace(/^(management of|treatment of|prevention of|relief of|prophylaxis of|for|control of|adjunct to|adjunctive therapy for)\s+/i, '')
        .replace(/\.$/, '')
        .trim();
      if (!clean) continue;
      const capitalized = clean.charAt(0).toUpperCase() + clean.slice(1);
      if (!uses.some((u) => u.toLowerCase() === capitalized.toLowerCase()) && capitalized.length >= 3) {
        uses.push(capitalized);
      }
    }
  }

  if (uses.length === 0 && med.drugClass) {
    uses.push(med.drugClass);
  }

  return uses.slice(0, 6);
}

export type ClinicalAlert = {
  type: 'duplicate' | 'interaction' | 'schedule8' | 'caution' | 'contraindication';
  severity: 'high' | 'moderate' | 'info';
  title: string;
  detail: string;
  points?: string[];
  prescriberAction?: string;
};

type ParsedClinicalProfile = {
  isDoac: boolean;
  isVka: boolean;
  isHeparin: boolean;
  isAnticoag: boolean;
  isAntiplatelet: boolean;
  isNsaid: boolean;
  isAcei: boolean;
  isArb: boolean;
  isArni: boolean;
  isBetaBlocker: boolean;
  isNonDhpCcb: boolean;
  isDhpCcb: boolean;
  isPotassiumSparingDiuretic: boolean;
  isDiuretic: boolean;
  isStatin: boolean;
  isStrongCyp3a4Inhibitor: boolean;
  isNitrate: boolean;
  isPde5: boolean;
  isSsriOrSnri: boolean;
  isMaoi: boolean;
  isTramadol: boolean;
  isOpioid: boolean;
  isBenzoOrZDrug: boolean;
  isGlp1OrGip: boolean;
  isSglt2: boolean;
  isPpi: boolean;
  isCyp2c19Ppi: boolean;
  isMethotrexate: boolean;
  isAllopurinol: boolean;
  isAzathioprine: boolean;
  isLithium: boolean;
  isQtProlonging: boolean;
};

function parseClinicalProfile(text: string, drugClass = ''): ParsedClinicalProfile {
  const t = `${text} ${drugClass}`.toLowerCase();

  const isDoac =
    t.includes('apixaban') || t.includes('eliquis') ||
    t.includes('rivaroxaban') || t.includes('xarelto') ||
    t.includes('dabigatran') || t.includes('pradaxa') ||
    t.includes('edoxaban') || t.includes('lixiana');

  const isVka = t.includes('warfarin') || t.includes('coumadin') || t.includes('marevan');

  const isHeparin =
    t.includes('enoxaparin') || t.includes('clexane') ||
    t.includes('dalteparin') || t.includes('fragmin') || t.includes('heparin');

  const isAnticoag = isDoac || isVka || isHeparin || t.includes('oral anticoagulant') || t.includes('anticoagulant');

  const isAntiplatelet =
    t.includes('clopidogrel') || t.includes('plavix') || t.includes('iscover') ||
    t.includes('ticagrelor') || t.includes('brilinta') ||
    t.includes('prasugrel') || t.includes('effient') ||
    t.includes('aspirin') || t.includes('acetylsalicylic') || t.includes('cartia') || t.includes('astrix') || t.includes('asasantin') ||
    t.includes('dipyridamole') || t.includes('antiplatelet');

  const isNsaid =
    t.includes('ibuprofen') || t.includes('nurofen') || t.includes('brufen') ||
    t.includes('naproxen') || t.includes('naprosyn') || t.includes('naprogesic') ||
    t.includes('celecoxib') || t.includes('celebrex') ||
    t.includes('meloxicam') || t.includes('mobic') ||
    t.includes('diclofenac') || t.includes('voltaren') ||
    t.includes('indomethacin') || t.includes('indocid') ||
    t.includes('ketoprofen') || t.includes('piroxicam') || t.includes('mefenamic');

  const isAcei =
    t.includes('perindopril') || t.includes('coversyl') || t.includes('coveram') || t.includes('coversyl plus') ||
    t.includes('ramipril') || t.includes('tritace') ||
    t.includes('enalapril') || t.includes('renitec') ||
    t.includes('lisinopril') || t.includes('zestril') ||
    t.includes('captopril') || t.includes('fosinopril') || t.includes('trandolapril');

  const isArb =
    t.includes('candesartan') || t.includes('atacand') ||
    t.includes('irbesartan') || t.includes('avapro') ||
    t.includes('telmisartan') || t.includes('micardis') || t.includes('twynsta') ||
    t.includes('valsartan') || t.includes('diovan') || t.includes('exforge') ||
    t.includes('olmesartan') || t.includes('olmetec') ||
    t.includes('losartan') || t.includes('cozaar');

  const isArni = t.includes('sacubitril') || t.includes('entresto');

  const isBetaBlocker =
    t.includes('metoprolol') || t.includes('betaloc') || t.includes('minax') || t.includes('toprol') ||
    t.includes('bisoprolol') || t.includes('concor') || t.includes('bicor') ||
    t.includes('atenolol') || t.includes('tenormin') || t.includes('noten') ||
    t.includes('carvedilol') || t.includes('dilatrend') ||
    t.includes('nebivolol') || t.includes('nebilet') ||
    t.includes('propranolol') || t.includes('inderal') ||
    t.includes('sotalol') || t.includes('sotacor');

  const isNonDhpCcb =
    t.includes('verapamil') || t.includes('isoptin') || t.includes('veracaps') ||
    t.includes('diltiazem') || t.includes('cardizem') || t.includes('vasocardol');

  const isDhpCcb =
    t.includes('amlodipine') || t.includes('norvasc') ||
    t.includes('lercanidipine') || t.includes('zanidip') ||
    t.includes('felodipine') || t.includes('plendil') ||
    t.includes('nifedipine') || t.includes('adalat');

  const isPotassiumSparingDiuretic =
    t.includes('spironolactone') || t.includes('aldactone') ||
    t.includes('eplerenone') || t.includes('inspra') ||
    t.includes('amiloride') || t.includes('kaluril');

  const isDiuretic =
    isPotassiumSparingDiuretic ||
    t.includes('furosemide') || t.includes('frusemide') || t.includes('lasix') ||
    t.includes('indapamide') || t.includes('natrilix') ||
    t.includes('hydrochlorothiazide') || t.includes('chlortalidone') || t.includes('bumetanide');

  const isStatin =
    t.includes('atorvastatin') || t.includes('lipitor') ||
    t.includes('rosuvastatin') || t.includes('crestor') ||
    t.includes('simvastatin') || t.includes('zocor') ||
    t.includes('pravastatin') || t.includes('pravachol') ||
    t.includes('fluvastatin');

  const isStrongCyp3a4Inhibitor =
    t.includes('clarithromycin') || t.includes('klacid') ||
    t.includes('erythromycin') || t.includes('eryc') ||
    t.includes('ketoconazole') || t.includes('itraconazole') || t.includes('sporanox') || t.includes('nizoral') ||
    t.includes('diltiazem') || t.includes('verapamil');

  const isNitrate =
    t.includes('glyceryl trinitrate') || t.includes('anginine') || t.includes('nitrolingual') || t.includes('nitro-dur') ||
    t.includes('isosorbide') || t.includes('imdur') || t.includes('isordil');

  const isPde5 =
    t.includes('sildenafil') || t.includes('viagra') ||
    t.includes('tadalafil') || t.includes('cialis') ||
    t.includes('vardenafil') || t.includes('levitra');

  const isSsriOrSnri =
    t.includes('sertraline') || t.includes('zoloft') ||
    t.includes('escitalopram') || t.includes('lexapro') ||
    t.includes('citalopram') || t.includes('cipramil') || t.includes('celapram') ||
    t.includes('fluoxetine') || t.includes('prozac') || t.includes('lovan') ||
    t.includes('paroxetine') || t.includes('aropax') ||
    t.includes('fluvoxamine') || t.includes('luvox') ||
    t.includes('venlafaxine') || t.includes('efexor') ||
    t.includes('desvenlafaxine') || t.includes('pristiq') ||
    t.includes('duloxetine') || t.includes('cymbalta');

  const isMaoi =
    t.includes('moclobemide') || t.includes('aurorix') ||
    t.includes('phenelzine') || t.includes('nardil') ||
    t.includes('tranylcypromine') || t.includes('parnate') ||
    t.includes('selegiline') || t.includes('linezolid');

  const isTramadol = t.includes('tramadol') || t.includes('tramal') || t.includes('zydol');

  const isOpioid =
    t.includes('oxycodone') || t.includes('endone') || t.includes('oxycontin') || t.includes('targin') || t.includes('proladone') ||
    t.includes('morphine') || t.includes('ms contin') || t.includes('ordine') || t.includes('kapanol') ||
    t.includes('fentanyl') || t.includes('durogesic') ||
    t.includes('codeine') || t.includes('panadeine forte') ||
    t.includes('tapentadol') || t.includes('palexia') ||
    t.includes('buprenorphine') || t.includes('norspan') || t.includes('subutex') || t.includes('suboxone') ||
    t.includes('hydromorphone') || t.includes('dilaudid') ||
    t.includes('methadone') || t.includes('pethidine');

  const isBenzoOrZDrug =
    t.includes('diazepam') || t.includes('valium') ||
    t.includes('temazepam') || t.includes('normison') ||
    t.includes('lorazepam') || t.includes('ativan') ||
    t.includes('clonazepam') || t.includes('rivotril') || t.includes('paxam') ||
    t.includes('alprazolam') || t.includes('kalma') || t.includes('alprax') || t.includes('xanax') ||
    t.includes('oxazepam') || t.includes('serepax') ||
    t.includes('nitrazepam') || t.includes('mogadon') ||
    t.includes('zolpidem') || t.includes('stilnox') ||
    t.includes('zopiclone') || t.includes('imovane');

  const isGlp1OrGip =
    t.includes('semaglutide') || t.includes('ozempic') || t.includes('wegovy') ||
    t.includes('tirzepatide') || t.includes('mounjaro') ||
    t.includes('liraglutide') || t.includes('saxenda') || t.includes('victoza') ||
    t.includes('dulaglutide') || t.includes('trulicity');

  const isSglt2 =
    t.includes('empagliflozin') || t.includes('jardiance') || t.includes('jardiamet') || t.includes('glyxambi') ||
    t.includes('dapagliflozin') || t.includes('forxiga') || t.includes('xigduo');

  const isPpi =
    t.includes('esomeprazole') || t.includes('nexium') ||
    t.includes('omeprazole') || t.includes('losec') ||
    t.includes('pantoprazole') || t.includes('somac') ||
    t.includes('rabeprazole') || t.includes('pariet') ||
    t.includes('lansoprazole') || t.includes('zoton');

  const isCyp2c19Ppi =
    t.includes('omeprazole') || t.includes('losec') || t.includes('esomeprazole') || t.includes('nexium');

  const isMethotrexate = t.includes('methotrexate') || t.includes('methoblastin') || t.includes('trextie');

  const isAllopurinol =
    t.includes('allopurinol') || t.includes('zyloprim') || t.includes('progout') ||
    t.includes('febuxostat') || t.includes('adenuric');

  const isAzathioprine =
    t.includes('azathioprine') || t.includes('imuran') ||
    t.includes('mercaptopurine') || t.includes('6-mercaptopurine') || t.includes('puri-nethol');

  const isLithium = t.includes('lithium') || t.includes('lithicarb') || t.includes('quilonum');

  const isQtProlonging =
    t.includes('amiodarone') || t.includes('cordarone') ||
    t.includes('sotalol') || t.includes('sotacor') ||
    t.includes('flecainide') || t.includes('tambocor') ||
    t.includes('clarithromycin') || t.includes('klacid') ||
    t.includes('erythromycin') || t.includes('eryc') ||
    t.includes('ciprofloxacin') || t.includes('ciproxin') ||
    t.includes('moxifloxacin') || t.includes('avelox') ||
    t.includes('citalopram') || t.includes('cipramil') || t.includes('celapram') ||
    t.includes('escitalopram') || t.includes('lexapro') ||
    t.includes('quetiapine') || t.includes('seroquel') ||
    t.includes('haloperidol') || t.includes('serenace') ||
    t.includes('domperidone') || t.includes('motilium') ||
    t.includes('ondansetron') || t.includes('zofran');

  return {
    isDoac, isVka, isHeparin, isAnticoag, isAntiplatelet, isNsaid,
    isAcei, isArb, isArni, isBetaBlocker, isNonDhpCcb, isDhpCcb,
    isPotassiumSparingDiuretic, isDiuretic, isStatin, isStrongCyp3a4Inhibitor,
    isNitrate, isPde5, isSsriOrSnri, isMaoi, isTramadol, isOpioid,
    isBenzoOrZDrug, isGlp1OrGip, isSglt2, isPpi, isCyp2c19Ppi,
    isMethotrexate, isAllopurinol, isAzathioprine, isLithium, isQtProlonging
  };
}

/**
 * Clinical safety check against the patient's existing active medications.
 * Checks for duplicate active therapies and high-risk Australian co-prescribing combinations.
 */
export function checkClinicalInteractions(
  candidate: { medicationName: string; genericName?: string; brandName?: string; drugClass?: string; schedule?: string },
  activeMeds: Array<{ medication_name: string; generic_name?: string | null; brand_name?: string | null }>
): ClinicalAlert[] {
  const alerts: ClinicalAlert[] = [];
  const candidateGeneric = (candidate.genericName || '').toLowerCase().trim();
  const candidateBrand = (candidate.brandName || candidate.medicationName || '').toLowerCase().trim();
  const candidateText = `${candidate.medicationName} ${candidate.genericName ?? ''} ${candidate.brandName ?? ''} ${candidate.drugClass ?? ''}`.toLowerCase();

  const c = parseClinicalProfile(candidateText, candidate.drugClass);

  // 1. S8 Controlled Drug Warning
  if (
    candidate.schedule === 'S8' ||
    c.isOpioid ||
    candidateText.includes('vyvanse') ||
    candidateText.includes('ritalin') ||
    candidateText.includes('concerta') ||
    candidateText.includes('dexamfetamine')
  ) {
    alerts.push({
      type: 'schedule8',
      severity: 'moderate',
      title: 'Schedule 8 Controlled Drug (S8)',
      detail:
        'This is an Australian Schedule 8 controlled medicine. Check real-time prescription monitoring (SafeScript / QScript / ScriptCheck) and verify valid Authority/Permit before dispensing.',
    });
  }

  // 2. SGLT2 Inhibitor Sick-Day Advice
  if (c.isSglt2) {
    alerts.push({
      type: 'caution',
      severity: 'info',
      title: 'SGLT2 Inhibitor Sick-Day Protocol',
      detail:
        'Advise patient to temporarily withhold this SGLT2 inhibitor during acute dehydrating illness, severe gastroenteritis, prolonged fasting, or major surgery to prevent euglycaemic DKA.',
    });
  }

  let totalAntithromboticCount = (c.isAnticoag ? 1 : 0) + (c.isAntiplatelet ? 1 : 0);
  const activeAntithromboticNames: string[] = [];
  if (c.isAnticoag || c.isAntiplatelet) activeAntithromboticNames.push(candidate.medicationName);

  let hasAceOrArb = c.isAcei || c.isArb;
  let hasDiuretic = c.isDiuretic;
  let hasNsaid = c.isNsaid;

  let totalQtCount = c.isQtProlonging ? 1 : 0;
  const qtDrugNames: string[] = [];
  if (c.isQtProlonging) qtDrugNames.push(candidate.medicationName);

  const duplicateMeds: string[] = [];
  const activeAnticoagulants: string[] = [];
  const activeAntiplatelets: string[] = [];
  const activeNsaids: string[] = [];
  const activeNitrates: string[] = [];
  const activeArnis: string[] = [];
  const activeAzathioprine: string[] = [];
  const activeLithium: string[] = [];
  const activeSedatives: string[] = [];
  const activeCyp2c19Ppis: string[] = [];
  const activeArbs: string[] = [];
  const activePotassiumSparing: string[] = [];
  const activeNonDhpCcbs: string[] = [];
  const activeStrongCyp3a4: string[] = [];
  const activeMethotrexate: string[] = [];
  const activeTramadol: string[] = [];
  const duplicateStatins: string[] = [];
  const duplicatePpis: string[] = [];
  const duplicateGlp1s: string[] = [];
  const duplicateBetaBlockers: string[] = [];
  const duplicateNsaids: string[] = [];

  for (const existing of activeMeds) {
    const existingGeneric = (existing.generic_name || '').toLowerCase().trim();
    const existingBrand = (existing.brand_name || existing.medication_name || '').toLowerCase().trim();
    const existingText = `${existing.medication_name} ${existing.generic_name ?? ''} ${existing.brand_name ?? ''}`.toLowerCase();
    const e = parseClinicalProfile(existingText);

    if (e.isAnticoag || e.isAntiplatelet) {
      totalAntithromboticCount++;
      if (!activeAntithromboticNames.includes(existing.medication_name)) {
        activeAntithromboticNames.push(existing.medication_name);
      }
    }

    if (e.isAcei || e.isArb) hasAceOrArb = true;
    if (e.isDiuretic) hasDiuretic = true;
    if (e.isNsaid) hasNsaid = true;

    if (e.isQtProlonging) {
      totalQtCount++;
      if (!qtDrugNames.includes(existing.medication_name)) {
        qtDrugNames.push(existing.medication_name);
      }
    }

    // A. DUPLICATE ACTIVE INGREDIENT
    const isDuplicate =
      (candidateGeneric && existingGeneric && (candidateGeneric === existingGeneric || (candidateGeneric.length >= 4 && existingGeneric.length >= 4 && (candidateGeneric.startsWith(existingGeneric) || existingGeneric.startsWith(candidateGeneric))))) ||
      (candidateBrand && existingBrand && candidateBrand === existingBrand);
    if (isDuplicate && !duplicateMeds.includes(existing.medication_name)) {
      duplicateMeds.push(existing.medication_name);
      continue;
    }

    // B. MULTIPLE ANTICOAGULANTS
    if (c.isAnticoag && e.isAnticoag && !activeAnticoagulants.includes(existing.medication_name)) {
      activeAnticoagulants.push(existing.medication_name);
    }

    // C. ANTICOAGULANT + ANTIPLATELET COMBINATION
    if (((c.isAnticoag && e.isAntiplatelet) || (c.isAntiplatelet && e.isAnticoag)) && !activeAntiplatelets.includes(existing.medication_name)) {
      activeAntiplatelets.push(existing.medication_name);
    }

    // D. BLOOD THINNER + NSAID
    if ((((c.isAnticoag || c.isAntiplatelet) && e.isNsaid) || (c.isNsaid && (e.isAnticoag || e.isAntiplatelet))) && !activeNsaids.includes(existing.medication_name)) {
      activeNsaids.push(existing.medication_name);
    }

    // E. PDE-5 INHIBITOR + ORGANIC NITRATE
    if (((c.isPde5 && e.isNitrate) || (c.isNitrate && e.isPde5)) && !activeNitrates.includes(existing.medication_name)) {
      activeNitrates.push(existing.medication_name);
    }

    // F. ENTRESTO + ACE INHIBITOR
    if (((c.isArni && e.isAcei) || (c.isAcei && e.isArni)) && !activeArnis.includes(existing.medication_name)) {
      activeArnis.push(existing.medication_name);
    }

    // G. ALLOPURINOL + AZATHIOPRINE / 6-MP
    if (((c.isAllopurinol && e.isAzathioprine) || (c.isAzathioprine && e.isAllopurinol)) && !activeAzathioprine.includes(existing.medication_name)) {
      activeAzathioprine.push(existing.medication_name);
    }

    // H. LITHIUM TOXICITY
    if (((c.isLithium && (e.isNsaid || e.isAcei || e.isArb || e.isDiuretic)) || ((c.isNsaid || c.isAcei || c.isArb || c.isDiuretic) && e.isLithium)) && !activeLithium.includes(existing.medication_name)) {
      activeLithium.push(existing.medication_name);
    }

    // I. OPIOID + BENZODIAZEPINE / SEDATIVE
    if (((c.isOpioid && e.isBenzoOrZDrug) || (c.isBenzoOrZDrug && e.isOpioid)) && !activeSedatives.includes(existing.medication_name)) {
      activeSedatives.push(existing.medication_name);
    }

    // J. CLOPIDOGREL + CYP2C19 INHIBITING PPI
    const isCandidateClopidogrel = candidateText.includes('clopidogrel') || candidateText.includes('plavix');
    const isExistingClopidogrel = existingText.includes('clopidogrel') || existingText.includes('plavix');
    if (((isCandidateClopidogrel && e.isCyp2c19Ppi) || (c.isCyp2c19Ppi && isExistingClopidogrel)) && !activeCyp2c19Ppis.includes(existing.medication_name)) {
      activeCyp2c19Ppis.push(existing.medication_name);
    }

    // K. DUAL RAAS BLOCKADE (ACEi + ARB)
    if (((c.isAcei && e.isArb) || (c.isArb && e.isAcei)) && !activeArbs.includes(existing.medication_name)) {
      activeArbs.push(existing.medication_name);
    }

    // L. POTASSIUM-SPARING DIURETIC + ACEi/ARB
    if (((c.isPotassiumSparingDiuretic && (e.isAcei || e.isArb)) || ((c.isAcei || c.isArb) && e.isPotassiumSparingDiuretic)) && !activePotassiumSparing.includes(existing.medication_name)) {
      activePotassiumSparing.push(existing.medication_name);
    }

    // M. BETA-BLOCKER + NON-DHP CCB
    if (((c.isBetaBlocker && e.isNonDhpCcb) || (c.isNonDhpCcb && e.isBetaBlocker)) && !activeNonDhpCcbs.includes(existing.medication_name)) {
      activeNonDhpCcbs.push(existing.medication_name);
    }

    // N. STATIN + STRONG CYP3A4 INHIBITOR
    const isCandidateCyp3a4Statin = candidateText.includes('atorvastatin') || candidateText.includes('simvastatin') || candidateText.includes('lipitor') || candidateText.includes('zocor');
    const isExistingCyp3a4Statin = existingText.includes('atorvastatin') || existingText.includes('simvastatin') || existingText.includes('lipitor') || existingText.includes('zocor');
    if (((isCandidateCyp3a4Statin && e.isStrongCyp3a4Inhibitor) || (c.isStrongCyp3a4Inhibitor && isExistingCyp3a4Statin)) && !activeStrongCyp3a4.includes(existing.medication_name)) {
      activeStrongCyp3a4.push(existing.medication_name);
    }

    // O. METHOTREXATE + NSAID
    if (((c.isMethotrexate && e.isNsaid) || (c.isNsaid && e.isMethotrexate)) && !activeMethotrexate.includes(existing.medication_name)) {
      activeMethotrexate.push(existing.medication_name);
    }

    // P. SEROTONIN TOXICITY (SSRI/SNRI + Tramadol)
    if (((c.isSsriOrSnri && e.isTramadol) || (c.isTramadol && e.isSsriOrSnri)) && !activeTramadol.includes(existing.medication_name)) {
      activeTramadol.push(existing.medication_name);
    }

    // Q. THERAPEUTIC CLASS DUPLICATIONS
    if (c.isStatin && e.isStatin && !duplicateStatins.includes(existing.medication_name)) duplicateStatins.push(existing.medication_name);
    if (c.isPpi && e.isPpi && !duplicatePpis.includes(existing.medication_name)) duplicatePpis.push(existing.medication_name);
    if (c.isGlp1OrGip && e.isGlp1OrGip && !duplicateGlp1s.includes(existing.medication_name)) duplicateGlp1s.push(existing.medication_name);
    if (c.isBetaBlocker && e.isBetaBlocker && !duplicateBetaBlockers.includes(existing.medication_name)) duplicateBetaBlockers.push(existing.medication_name);
    if (c.isNsaid && e.isNsaid && !duplicateNsaids.includes(existing.medication_name)) duplicateNsaids.push(existing.medication_name);
  }

  // GENERATE CONSOLIDATED ALERTS (ONE PER CLINICAL HAZARD)
  if (duplicateMeds.length > 0) {
    alerts.push({
      type: 'duplicate',
      severity: 'high',
      title: 'Duplicate Active Therapy Alert',
      detail: `Patient is already prescribed ${duplicateMeds.join(', ')}. Co-prescribing risks duplicate active ingredient dosing and toxicity.`,
    });
  }

  if (activeAnticoagulants.length > 0) {
    alerts.push({
      type: 'contraindication',
      severity: 'high',
      title: 'CONTRAINDICATED: Multiple Anticoagulants (Fatal Bleeding Risk)',
      detail: `Patient is active on ${activeAnticoagulants.join(' and ')}. Co-prescribing ${candidate.medicationName} creates concurrent full-dose systemic anticoagulation with extreme, potentially fatal risk of major haemorrhage. Multiple systemic anticoagulants must never be co-prescribed outside of strict bridging protocols.`,
    });
  }

  if (activeAntiplatelets.length > 0) {
    alerts.push({
      type: 'interaction',
      severity: 'high',
      title: 'High Bleeding Risk: Anticoagulant + Antiplatelet Combination',
      detail: `Co-prescribing with antiplatelet therapy (${activeAntiplatelets.join(', ')} + ${candidate.medicationName}) substantially elevates major haemorrhage risk (2 to 3-fold). Ensure validated clinical indication (e.g. post-PCI) and consider gastroprotection with a PPI.`,
    });
  }

  if (activeNsaids.length > 0) {
    alerts.push({
      type: 'interaction',
      severity: 'high',
      title: 'Major Bleeding Hazard: Blood Thinner + NSAID',
      detail: `Co-prescribing an NSAID with blood thinners (${activeNsaids.join(', ')} + ${candidate.medicationName}) dramatically increases gastrointestinal ulceration and life-threatening bleeding risk. Substitute with paracetamol.`,
    });
  }

  if (activeNitrates.length > 0) {
    alerts.push({
      type: 'contraindication',
      severity: 'high',
      title: 'LETHAL CONTRAINDICATION: PDE5 Inhibitor + Organic Nitrate',
      detail: `Co-prescribing PDE-5 inhibitors with organic nitrates (${activeNitrates.join(', ')} + ${candidate.medicationName}) causes profound, irreversible synergistic vasodilation, catastrophic hypotension, and cardiovascular collapse.`,
    });
  }

  if (activeArnis.length > 0) {
    alerts.push({
      type: 'contraindication',
      severity: 'high',
      title: 'FATAL ANGIOEDEMA CONTRAINDICATION: Entresto + ACE Inhibitor',
      detail: `Combining Entresto with an ACE inhibitor (${activeArnis.join(', ')} + ${candidate.medicationName}) triggers severe, life-threatening airway angioedema. A mandatory 36-hour washout period is required when switching from an ACE inhibitor.`,
    });
  }

  if (activeAzathioprine.length > 0) {
    alerts.push({
      type: 'contraindication',
      severity: 'high',
      title: 'LETHAL TOXICITY: Allopurinol + Azathioprine / 6-MP',
      detail: `Allopurinol blocks xanthine oxidase metabolism of azathioprine/6-MP (${activeAzathioprine.join(', ')} + ${candidate.medicationName}), causing catastrophic bone marrow aplasia and fatal pancytopenia.`,
    });
  }

  if (activeLithium.length > 0) {
    alerts.push({
      type: 'interaction',
      severity: 'high',
      title: 'Severe Lithium Toxicity Hazard',
      detail: `Co-prescribing ${candidate.medicationName} with Lithium therapy (${activeLithium.join(', ')}), impairs renal lithium clearance, triggering acute neurotoxicity, tremor, ataxia, seizures, and renal failure.`,
    });
  }

  if (activeSedatives.length > 0) {
    alerts.push({
      type: 'interaction',
      severity: 'high',
      title: 'SafeScript Alert: Concurrent Opioid + Sedative/Benzodiazepine',
      detail: `Co-prescribing opioids with benzodiazepines or sedatives (${activeSedatives.join(', ')} + ${candidate.medicationName}) causes additive CNS and respiratory depression, drastically heightening fatal overdose risk.`,
    });
  }

  if (activeCyp2c19Ppis.length > 0) {
    alerts.push({
      type: 'interaction',
      severity: 'high',
      title: 'Loss of Antiplatelet Efficacy: Clopidogrel + Omeprazole/Esomeprazole',
      detail: `Omeprazole/esomeprazole inhibit CYP2C19, blocking metabolic conversion of clopidogrel to its active antiplatelet form (${activeCyp2c19Ppis.join(', ')} + ${candidate.medicationName}). Switch PPI to Pantoprazole (Somac).`,
    });
  }

  if (activeArbs.length > 0) {
    alerts.push({
      type: 'interaction',
      severity: 'high',
      title: 'Dual RAAS Blockade Caution (ACEi + ARB)',
      detail: `Combining ACE inhibitors and ARBs (${activeArbs.join(', ')} + ${candidate.medicationName}) increases the risk of severe hyperkalaemia, hypotension, and acute kidney injury without mortality benefit.`,
    });
  }

  if (activePotassiumSparing.length > 0) {
    alerts.push({
      type: 'interaction',
      severity: 'high',
      title: 'Severe Hyperkalaemia Hazard: Potassium-Sparing Diuretic + ACEi/ARB',
      detail: `Combining spironolactone/eplerenone with an ACE inhibitor or ARB (${activePotassiumSparing.join(', ')} + ${candidate.medicationName}) dramatically increases serum potassium retention. Close monitoring of K+ and renal function is mandatory.`,
    });
  }

  if (activeNonDhpCcbs.length > 0) {
    alerts.push({
      type: 'interaction',
      severity: 'high',
      title: 'Severe Bradycardia & AV Block Hazard: Beta-Blocker + Verapamil/Diltiazem',
      detail: `Combining a beta-blocker with verapamil or diltiazem (${activeNonDhpCcbs.join(', ')} + ${candidate.medicationName}) produces synergistic AV nodal depression and severe bradycardia.`,
    });
  }

  if (activeStrongCyp3a4.length > 0) {
    alerts.push({
      type: 'interaction',
      severity: 'high',
      title: 'Statin Rhabdomyolysis Hazard: CYP3A4 Statin + Potent Inhibitor',
      detail: `Co-prescribing atorvastatin/simvastatin with a strong CYP3A4 inhibitor (${activeStrongCyp3a4.join(', ')} + ${candidate.medicationName}) substantially elevates statin plasma levels, triggering life-threatening rhabdomyolysis.`,
    });
  }

  if (activeMethotrexate.length > 0) {
    alerts.push({
      type: 'interaction',
      severity: 'high',
      title: 'Methotrexate Toxicity Hazard: Reduced Clearance with NSAIDs',
      detail: `NSAIDs reduce renal methotrexate excretion (${activeMethotrexate.join(', ')} + ${candidate.medicationName}), causing severe bone marrow suppression and toxicity.`,
    });
  }

  if (activeTramadol.length > 0) {
    alerts.push({
      type: 'interaction',
      severity: 'high',
      title: 'Serotonin Syndrome Hazard: SSRI/SNRI + Tramadol',
      detail: `Combining tramadol with an antidepressant (${activeTramadol.join(', ')} + ${candidate.medicationName}) increases the risk of Serotonin Syndrome and reduces seizure threshold.`,
    });
  }

  if (duplicateStatins.length > 0) {
    alerts.push({
      type: 'duplicate',
      severity: 'high',
      title: 'Therapeutic Duplication: Multiple Statins',
      detail: `Patient is already on statin therapy (${duplicateStatins.join(', ')}). Co-prescribing another statin (${candidate.medicationName}) provides no additional benefit and multiplies myopathy risk.`,
    });
  }

  if (duplicatePpis.length > 0) {
    alerts.push({
      type: 'duplicate',
      severity: 'moderate',
      title: 'Therapeutic Duplication: Multiple Proton Pump Inhibitors',
      detail: `Patient is already prescribed a PPI (${duplicatePpis.join(', ')}). Co-prescribing multiple PPIs (${candidate.medicationName}) is redundant.`,
    });
  }

  if (duplicateGlp1s.length > 0) {
    alerts.push({
      type: 'duplicate',
      severity: 'high',
      title: 'Therapeutic Duplication: Multiple GLP-1 / GIP Incretin Agonists',
      detail: `Patient is already taking an incretin agonist (${duplicateGlp1s.join(', ')}). Combining Ozempic, Wegovy, or Mounjaro is contraindicated and causes severe gastrointestinal toxicity.`,
    });
  }

  if (duplicateBetaBlockers.length > 0) {
    alerts.push({
      type: 'duplicate',
      severity: 'high',
      title: 'Therapeutic Duplication: Multiple Beta-Blockers',
      detail: `Patient is already taking a beta-blocker (${duplicateBetaBlockers.join(', ')}). Adding another beta-blocker (${candidate.medicationName}) risks severe bradycardia and hypotension.`,
    });
  }

  if (duplicateNsaids.length > 0) {
    alerts.push({
      type: 'duplicate',
      severity: 'high',
      title: 'Therapeutic Duplication: Multiple Systemic NSAIDs',
      detail: `Patient is already on an NSAID (${duplicateNsaids.join(', ')}). Co-prescribing multiple systemic NSAIDs (${candidate.medicationName}) drastically multiplies peptic ulceration and renal failure risk.`,
    });
  }

  // 3. MULTI-AGENT ANTITHROMBOTIC POLYPHARMACY (if not already covered by multiple anticoagulants)
  if (totalAntithromboticCount >= 3 && activeAnticoagulants.length === 0) {
    alerts.unshift({
      type: 'contraindication',
      severity: 'high',
      title: 'CRITICAL ALERT: Multi-Agent Antithrombotic Polypharmacy (Extreme Haemorrhagic Hazard)',
      detail: `Extreme bleeding hazard: Patient is exposed to ${totalAntithromboticCount} concurrent blood thinners (${activeAntithromboticNames.join(', ')}). Multiple anticoagulants with antiplatelets should never be co-administered without formal cardiology/haematology governance.`,
    });
  }

  // 4. TRIPLE WHAMMY CHECK (ACEi/ARB + Diuretic + NSAID)
  if (hasAceOrArb && hasDiuretic && hasNsaid) {
    alerts.push({
      type: 'interaction',
      severity: 'high',
      title: 'CRITICAL ALERT: "Triple Whammy" Acute Renal Failure Risk',
      detail:
        'Concurrent use of an ACE inhibitor/ARB, a diuretic, and an NSAID dramatically impairs renal hemodynamics (afferent constriction + efferent dilation + reduced circulating volume), precipitating sudden acute kidney injury and hyperkalaemia. Avoid combination; use paracetamol for analgesia.',
    });
  }

  // 5. ADDITIVE QT PROLONGATION
  if (totalQtCount >= 2) {
    alerts.push({
      type: 'interaction',
      severity: 'high',
      title: 'Additive QT Prolongation & Arrhythmia Hazard',
      detail: `Co-prescribing multiple QT-prolonging medicines (${qtDrugNames.join(' + ')}) produces additive delays in cardiac repolarisation, dramatically heightening the risk of Torsades de Pointes and sudden cardiac arrest.`,
    });
  }

  return alerts;
}

/**
 * Combines multiple clinical alerts into 1 unified, cohesive warning.
 * If 0 alerts: returns null.
 * If 1 alert: returns that alert directly.
 * If multiple alerts: groups and consolidates them into 1 single high-priority warning
 * with clean, non-repeating bullet points and a unified prescriber action.
 */
export function combineClinicalAlerts(alerts: ClinicalAlert[]): ClinicalAlert | null {
  if (!alerts || alerts.length === 0) return null;
  if (alerts.length === 1) return alerts[0];

  const hasContraindication = alerts.some((a) => a.type === 'contraindication');
  const hasHigh = alerts.some((a) => a.severity === 'high');
  const hasModerate = alerts.some((a) => a.severity === 'moderate');

  const severity: 'high' | 'moderate' | 'info' = hasHigh
    ? 'high'
    : hasModerate
    ? 'moderate'
    : 'info';

  const type: ClinicalAlert['type'] = hasContraindication
    ? 'contraindication'
    : alerts.some((a) => a.type === 'interaction')
    ? 'interaction'
    : alerts[0].type;

  const title = hasContraindication
    ? `CRITICAL CONTRAINDICATION: ${alerts.length} Significant Clinical Risks Identified`
    : `Clinical Safety Warning: ${alerts.length} Interaction Risks Identified`;

  // Deduplicate themes and extract points
  const points: string[] = [];
  const seenThemes = new Set<string>();

  for (const a of alerts) {
    const cleanTitle = a.title
      .replace(/^(CRITICAL ALERT: |LETHAL CONTRAINDICATION: |FATAL ANGIOEDEMA CONTRAINDICATION: |CONTRAINDICATED: |LETHAL TOXICITY: )/i, '')
      .trim();

    const themeKey = cleanTitle.toLowerCase().split(/[:(]/)[0].trim();
    if (seenThemes.has(themeKey)) continue;
    seenThemes.add(themeKey);

    points.push(`${cleanTitle} — ${a.detail}`);
  }

  const prescriberAction = hasContraindication
    ? 'Do not co-prescribe contraindicated combinations without formal specialist review and verified bridging protocol. Discontinue conflicting active medication(s) before dispensing.'
    : 'Review patient history, assess renal/hepatic parameters, and adjust dosing or select non-interacting alternatives.';

  return {
    type,
    severity,
    title,
    detail: points.join('\n\n'),
    points,
    prescriberAction,
  };
}
