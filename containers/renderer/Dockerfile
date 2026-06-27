FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

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
WORKDIR /workspace

RUN pip install --no-cache-dir manim==0.20.1

COPY containers/renderer/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

USER runner

ENTRYPOINT ["/entrypoint.sh"]
