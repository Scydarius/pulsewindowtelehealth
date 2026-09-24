# PulseWindow rPPG validation protocol

PulseWindow's camera reading is a research prototype. Do not use it to diagnose, triage, or change treatment.

## Purpose

Measure the error of the deployed rPPG implementation against a validated reference heart-rate device before making any accuracy claim.

## Per-participant procedure

1. Obtain the required ethics/consent approval before collecting data.
2. Record the reference device, camera/device model, browser, lighting, approximate camera distance, and whether glasses/facial hair are present.
3. Seat the participant facing steady, diffuse light. Avoid backlighting and direct sunlight.
4. Keep the face centred, uncovered where possible, and still; do not speak during capture.
5. Start the same reference device and PulseWindow capture together.
6. Run three separate 30-second captures with one minute of rest between captures.
7. Record only captures that PulseWindow marks high-quality; retain failed captures separately rather than deleting them.

## Report

For every test condition, compare the final PulseWindow rate with the paired reference rate. Report mean absolute error, mean bias, limits of agreement, failed-capture rate, and results by device, lighting condition, and relevant demographic groups. Do not average away failures.

## Acceptance decision

Set an acceptance threshold with clinical supervision before testing. Keep the interface labelled as research-only until the system has been independently validated for its intended population and use.
