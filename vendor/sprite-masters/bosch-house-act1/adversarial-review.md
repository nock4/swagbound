# Adversarial Review

## Verdict

conditional pipeline pass / art incomplete

## Merge Blockers

Current native sheet is rejected because these sprites do not follow Swagbound canon visually. Generate one target per native ChatGPT image, then run adversarial art review before alpha cleanup.

## Overclaims

Do not claim rejected sheet crops are generated candidates, final sprites, approved sprites, runtime sprites, or EarthBound parity proof. The current native sheet is rejected evidence only.

## Scope Creep

No runtime, package, public-data, map, Godot, Act 2, save/load, or roster-promotion scope belongs in this lane.

## Forbidden Path Check

Expected touched paths are limited to `docs/ops/` and `asset-lab/sprite-generation` / `asset-lab/sprites/bosch-house-act1`.

## Artifact Truth Check

The review page must truthfully show `rejected-canon-mismatch`, `artApproval=rejected`, visual canon rejection, blocked alpha QA, `runtimePromotionAllowed=false`, and the raw native sheet as rejected evidence only.

## Validation Check

Run `python3 -m json.tool asset-lab/sprites/bosch-house-act1/manifests/bosch-house-act1-candidates.json >/dev/null`, `python3 asset-lab/sprite-generation/make-contact-sheet.py verify --pack bosch-house-act1`, `git diff --check`, and the forbidden-path grep from the final response.

## Tech Debt / Sprawl Risk

This is a single named native-import lane, not a `vN` ladder. Future Bosch House sprite reruns should update this lane or archive with explicit approval.

## Required Fixes Before Merge

Rewrite prompt cards from canon first, generate one target per native ChatGPT image on exact `#FF00FF`, and run adversarial art review before alpha cleanup. Human approval is still required before promotion.

## Recommendation

Pipeline scaffolding is acceptable, but the current art is rejected. Promote nothing until Nick selects replacement candidates and explicitly opens a runtime promotion pass.
