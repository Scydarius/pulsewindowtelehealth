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

export type ClinicalAlert = {
  type: 'duplicate' | 'interaction' | 'schedule8' | 'caution';
  severity: 'high' | 'moderate' | 'info';
  title: string;
  detail: string;
};

/**
 * Clinical safety check against the patient's existing active medications.
 * Checks for duplicate active therapies and high-risk Australian co-prescribing combinations.
 */
export function checkClinicalInteractions(
  candidate: { medicationName: string; genericName?: string; brandName?: string; drugClass?: string; schedule?: string },
  activeMeds: Array<{ medication_name: string; generic_name?: string | null; brand_name?: string | null }>
): ClinicalAlert[] {
  const alerts: ClinicalAlert[] = [];
  const candidateGeneric = (candidate.genericName || '').toLowerCase();
  const candidateBrand = (candidate.brandName || candidate.medicationName || '').toLowerCase();
  const candidateText = `${candidate.medicationName} ${candidate.genericName ?? ''} ${candidate.brandName ?? ''}`.toLowerCase();

  // 1. S8 Controlled Drug Warning
  if (
    candidate.schedule === 'S8' ||
    candidateText.includes('vyvanse') ||
    candidateText.includes('endone') ||
    candidateText.includes('palexia') ||
    candidateText.includes('ritalin') ||
    candidateText.includes('concerta') ||
    candidateText.includes('dexamfetamine') ||
    candidateText.includes('norspan') ||
    candidateText.includes('oxycodone') ||
    candidateText.includes('targin') ||
    candidateText.includes('fentanyl') ||
    candidateText.includes('morphine')
  ) {
    alerts.push({
      type: 'schedule8',
      severity: 'moderate',
      title: 'Schedule 8 Controlled Drug (S8)',
      detail:
        'This is a controlled Schedule 8 medicine. Check state prescription monitoring (SafeScript / ScriptCheck) and verify valid Authority/Permit before dispensing.',
    });
  }

  for (const existing of activeMeds) {
    const existingGeneric = (existing.generic_name || '').toLowerCase();
    const existingBrand = (existing.brand_name || existing.medication_name || '').toLowerCase();
    const existingText = `${existing.medication_name} ${existing.generic_name ?? ''} ${existing.brand_name ?? ''}`.toLowerCase();

    // 2. Duplicate Active Ingredient
    if (
      (candidateGeneric && existingGeneric && (candidateGeneric.includes(existingGeneric) || existingGeneric.includes(candidateGeneric))) ||
      (candidateBrand && existingBrand && candidateBrand === existingBrand)
    ) {
      alerts.push({
        type: 'duplicate',
        severity: 'high',
        title: 'Duplicate Therapy Alert',
        detail: `Patient is already prescribed ${existing.medication_name}. Co-prescribing may cause duplicate active ingredient dosing.`,
      });
      continue;
    }

    // 3. Dual RAAS Blockade (ACE inhibitor + ARB)
    const isCandidateAceOrArb =
      candidateText.includes('perindopril') || candidateText.includes('ramipril') || candidateText.includes('enalapril') ||
      candidateText.includes('candesartan') || candidateText.includes('irbesartan') || candidateText.includes('telmisartan') ||
      candidateText.includes('olmesartan') || candidateText.includes('valsartan');
    const isExistingAceOrArb =
      existingText.includes('perindopril') || existingText.includes('ramipril') || existingText.includes('enalapril') ||
      existingText.includes('candesartan') || existingText.includes('irbesartan') || existingText.includes('telmisartan') ||
      existingText.includes('olmesartan') || existingText.includes('valsartan');

    if (isCandidateAceOrArb && isExistingAceOrArb) {
      alerts.push({
        type: 'interaction',
        severity: 'high',
        title: 'Dual RAAS Blockade Caution',
        detail: `Combining ACE inhibitors and ARBs (${existing.medication_name} + ${candidate.medicationName}) increases the risk of severe hyperkalaemia, hypotension, and acute kidney injury.`,
      });
    }

    // 4. Blood Thinner + NSAID (Bleeding risk)
    const isCandidateNsaid =
      candidateText.includes('meloxicam') || candidateText.includes('celecoxib') || candidateText.includes('ibuprofen') ||
      candidateText.includes('naproxen') || candidateText.includes('diclofenac') || candidateText.includes('voltaren');
    const isExistingNsaid =
      existingText.includes('meloxicam') || existingText.includes('celecoxib') || existingText.includes('ibuprofen') ||
      existingText.includes('naproxen') || existingText.includes('diclofenac') || existingText.includes('voltaren');

    const isCandidateAnticoag =
      candidateText.includes('apixaban') || candidateText.includes('eliquis') || candidateText.includes('rivaroxaban') ||
      candidateText.includes('xarelto') || candidateText.includes('warfarin') || candidateText.includes('dabigatran') || candidateText.includes('pradaxa');
    const isExistingAnticoag =
      existingText.includes('apixaban') || existingText.includes('eliquis') || existingText.includes('rivaroxaban') ||
      existingText.includes('xarelto') || existingText.includes('warfarin') || existingText.includes('dabigatran') || existingText.includes('pradaxa');

    if ((isCandidateNsaid && isExistingAnticoag) || (isCandidateAnticoag && isExistingNsaid)) {
      alerts.push({
        type: 'interaction',
        severity: 'high',
        title: 'Major Bleeding Risk Caution',
        detail: `Co-prescribing an NSAID with an anticoagulant (${existing.medication_name} + ${candidate.medicationName}) significantly increases gastrointestinal and systemic haemorrhage risk. Consider paracetamol or PPI gastroprotection.`,
      });
    }

    // 5. Beta-blocker + Non-DHP Calcium Channel Blocker (Bradycardia / Heart block)
    const isCandidateBetaBlocker =
      candidateText.includes('metoprolol') || candidateText.includes('bisoprolol') || candidateText.includes('atenolol') ||
      candidateText.includes('carvedilol') || candidateText.includes('propranolol');
    const isExistingBetaBlocker =
      existingText.includes('metoprolol') || existingText.includes('bisoprolol') || existingText.includes('atenolol') ||
      existingText.includes('carvedilol') || existingText.includes('propranolol');

    const isCandidateNonDhpCcb =
      candidateText.includes('verapamil') || candidateText.includes('isoptin') || candidateText.includes('diltiazem') || candidateText.includes('cardizem');
    const isExistingNonDhpCcb =
      existingText.includes('verapamil') || existingText.includes('isoptin') || existingText.includes('diltiazem') || existingText.includes('cardizem');

    if ((isCandidateBetaBlocker && isExistingNonDhpCcb) || (isCandidateNonDhpCcb && isExistingBetaBlocker)) {
      alerts.push({
        type: 'interaction',
        severity: 'high',
        title: 'Severe Bradycardia / Heart Block Risk',
        detail: `Combining a beta-blocker with verapamil or diltiazem (${existing.medication_name} + ${candidate.medicationName}) causes profound AV nodal depression and heart failure risk. Avoid unless under cardiologist direction.`,
      });
    }

    // 6. Serotonergic Additive Risk (SSRI/SNRI + Tramadol)
    const isCandidateSerotonergic =
      candidateText.includes('sertraline') || candidateText.includes('escitalopram') || candidateText.includes('lexapro') ||
      candidateText.includes('zoloft') || candidateText.includes('venlafaxine') || candidateText.includes('desvenlafaxine') ||
      candidateText.includes('duloxetine') || candidateText.includes('fluoxetine');
    const isExistingSerotonergic =
      existingText.includes('sertraline') || existingText.includes('escitalopram') || existingText.includes('lexapro') ||
      existingText.includes('zoloft') || existingText.includes('venlafaxine') || existingText.includes('desvenlafaxine') ||
      existingText.includes('duloxetine') || existingText.includes('fluoxetine');

    const isCandidateTramadol = candidateText.includes('tramadol') || candidateText.includes('tramal');
    const isExistingTramadol = existingText.includes('tramadol') || existingText.includes('tramal');

    if ((isCandidateSerotonergic && isExistingTramadol) || (isCandidateTramadol && isExistingSerotonergic)) {
      alerts.push({
        type: 'interaction',
        severity: 'moderate',
        title: 'Serotonin Toxicity Caution',
        detail: `Combining tramadol with an SSRI/SNRI (${existing.medication_name} + ${candidate.medicationName}) increases the risk of Serotonin Syndrome and seizures. Monitor for agitation, tremor, or hyperreflexia.`,
      });
    }
  }

  return alerts;
}
