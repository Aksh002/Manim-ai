FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV XDG_CACHE_HOME=/tmp/.cache
ENV MPLCONFIGDIR=/tmp/.matplotlib

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
      ffmpeg \
      build-essential pkg-config \
      libcairo2 libcairo2-dev \
      libpango-1.0-0 libpango1.0-dev libpangocairo-1.0-0 \
      dvisvgm \
      texlive-latex-base texlive-latex-extra texlive-fonts-recommended texlive-science \
      fonts-dejavu \
    && rm -rf /var/lib/apt/lists/*

RUN useradd -ms /bin/bash runner
WORKDIR /srv/renderer

RUN pip install --no-cache-dir fastapi==0.115.14 uvicorn[standard]==0.35.0 manim==0.20.1

COPY containers/renderer_service/app.py /srv/renderer/app.py

USER runner

EXPOSE 8100
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8100"]
