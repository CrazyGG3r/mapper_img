# services/reconstruction-api/Dockerfile
#
# NOTE (see README.md): this Dockerfile has not been built or run in this
# scaffolding environment — there is no Python/Docker toolchain available
# here. It is written carefully against documented base-image behavior but
# is UNVERIFIED. Treat any build failure as a normal scaffold bug report,
# not a surprise.

FROM python:3.12-slim

WORKDIR /app

# opencv-python's wheels are "headless"-adjacent but still dlopen a handful of
# shared libraries (libGL, glib) that are not present in the `slim` base image.
# Installed explicitly and minimally rather than switching to opencv-python-headless
# so the same requirements.txt works for a future headed/debug image too.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        libgl1 \
        libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
