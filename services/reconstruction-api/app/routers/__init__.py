"""One router per heavy-compute concern (PRS §26): sfm, dense_reconstruction,
ai_inference, batch. Each is a stub — real handlers dispatch to native/GPU
backends and are a docs/roadmap.md Phase 2+ item — but every request/response
model is real and typed, so apps/web's HttpComputeBackend can be written and
type-checked against this service today, ahead of any real implementation.
"""
