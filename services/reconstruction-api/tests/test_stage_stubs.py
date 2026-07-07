"""Confirms every heavy-compute stage router is wired into the app and
responds with the documented 501 stub behavior, rather than a 404 (which
would indicate a router failed to register) or a silent 200.
"""

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_sfm_job_submission_is_a_stub():
    response = client.post(
        "/sfm/jobs",
        json={
            "project_id": "proj-1",
            "run_id": "run-1",
            "frame_refs": ["frame-0001", "frame-0002"],
        },
    )
    assert response.status_code == 501


def test_dense_reconstruction_job_submission_is_a_stub():
    response = client.post(
        "/dense-reconstruction/jobs",
        json={
            "project_id": "proj-1",
            "run_id": "run-1",
            "sparse_point_cloud_ref": "pc-sparse-1",
            "camera_poses": [
                {
                    "frame_id": "frame-0001",
                    "position": {"x": 0, "y": 0, "z": 0},
                    "rotation_quaternion": [0, 0, 0, 1],
                }
            ],
        },
    )
    assert response.status_code == 501


def test_ai_inference_job_submission_is_a_stub():
    response = client.post(
        "/ai-inference/jobs",
        json={
            "project_id": "proj-1",
            "run_id": "run-1",
            "model_id": "topview.wall-seg.v1",
            "target_entity_types": ["wall"],
            "input_refs": ["pc-dense-1"],
        },
    )
    assert response.status_code == 501


def test_batch_job_submission_is_a_stub():
    response = client.post(
        "/batch/jobs",
        json={
            "project_id": "proj-1",
            "run_id": "run-1",
            "stages": [
                {
                    "stage": "wall-detection",
                    "plugin_id": "topview.detector.example-wall-heuristic",
                    "payload": {},
                }
            ],
        },
    )
    assert response.status_code == 501


def test_job_status_lookups_are_stubs_not_missing_routes():
    for path in (
        "/sfm/jobs/does-not-exist",
        "/dense-reconstruction/jobs/does-not-exist",
        "/ai-inference/jobs/does-not-exist",
        "/batch/jobs/does-not-exist",
    ):
        response = client.get(path)
        assert response.status_code == 501, f"{path} should be a 501 stub, not {response.status_code}"
