import artgData from '../data/artg-medications.json';

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

/** Search Australian Register of Therapeutic Goods prescribable medicines */
export function searchArtgMedications(query: string, limit = 20): ArtgMedication[] {
  const q = query.trim().toLowerCase();
  if (!q) return ARTG_MEDICATIONS.slice(0, limit);

  const tokens = q.split(/\s+/).filter(Boolean);

  const results = ARTG_MEDICATIONS.filter((med) => {
    const haystack = `${med.brand} ${med.generic} ${med.name} ${med.strength} ${med.form} ${med.category} ${med.drugClass}`.toLowerCase();
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
  if (candidate.schedule === 'S8' || candidateText.includes('vyvanse') || candidateText.includes('endone') || candidateText.includes('palexia') || candidateText.includes('ritalin') || candidateText.includes('concerta') || candidateText.includes('dexamfetamine') || candidateText.includes('norspan') || candidateText.includes('oxycodone')) {
    alerts.push({
      type: 'schedule8',
      severity: 'moderate',
      title: 'Schedule 8 Controlled Drug (S8)',
      detail: 'This is a controlled Schedule 8 medicine. Check state prescription monitoring (SafeScript / ScriptCheck) and verify valid Authority/Permit before dispensing.',
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
