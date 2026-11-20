/**
 * Real-time Webcam Face/Gaze Tracker powered by @mediapipe/tasks-vision FaceLandmarker.
 * Maps the user's face & eye center relative to the webcam frame into normalized
 * (-1..1) gaze offsets so the VRM avatar tracks where the user moves and looks.
 */
export class WebcamGazeTracker {
  private stream: MediaStream | null = null;
  private video: HTMLVideoElement | null = null;
  private landmarker: import('@mediapipe/tasks-vision').FaceLandmarker | null = null;
  private running = false;
  private lastVideoTime = -1;

  public async start(): Promise<void> {
    if (this.running) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('이 브라우저에서는 웹캠 시선 추적을 지원하지 않습니다.');
    }

    this.stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 640 }, height: { ideal: 360 }, facingMode: 'user' },
      audio: false,
    });

    this.video = document.createElement('video');
    this.video.playsInline = true;
    this.video.muted = true;
    this.video.srcObject = this.stream;
    await this.video.play();

    const vision = await import('@mediapipe/tasks-vision');
    const filesetResolver = await vision.FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.34/wasm',
    );
    this.landmarker = await vision.FaceLandmarker.createFromOptions(
      filesetResolver,
      {
        baseOptions: {
          modelAssetPath:
            'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
          delegate: 'GPU',
        },
        runningMode: 'VIDEO',
        numFaces: 1,
      },
    );

    this.running = true;
  }

  public sampleOffset(): { x: number; y: number } | null {
    if (
      !this.running ||
      !this.video ||
      !this.landmarker ||
      this.video.readyState < 2
    ) {
      return null;
    }

    const nowMs = performance.now();
    if (this.video.currentTime === this.lastVideoTime) {
      return null;
    }
    this.lastVideoTime = this.video.currentTime;

    const result = this.landmarker.detectForVideo(this.video, nowMs);
    const face = result.faceLandmarks?.[0];
    if (!face || face.length === 0) return null;

    // Nose bridge landmark (#1) & eye center estimate
    const nose = face[1];
    // Mirror X because webcam is mirrored horizontally relative to user perspective
    const x = (0.5 - nose.x) * 2.2;
    const y = (0.5 - nose.y) * 1.6;
    return {
      x: Math.max(-1, Math.min(1, x)),
      y: Math.max(-1, Math.min(1, y)),
    };
  }

  public get isRunning(): boolean {
    return this.running;
  }

  public stop(): void {
    this.running = false;
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
    if (this.video) {
      this.video.srcObject = null;
      this.video = null;
    }
    this.landmarker?.close();
    this.landmarker = null;
  }
}
