FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
      ffmpeg curl \
      docker-cli \
      libcairo2 libpango-1.0-0 libpangocairo-1.0-0 \
      build-essential pkg-config libcairo2-dev libpango1.0-dev \
      dvisvgm \
      texlive-latex-base texlive-latex-extra texlive-fonts-recommended texlive-science \
      fonts-dejavu \
    && rm -rf /var/lib/apt/lists/*

COPY . /app
RUN pip install --no-cache-dir manim==0.20.1
RUN pip install --no-cache-dir -e .[dev]

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
