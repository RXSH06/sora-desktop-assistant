#!/usr/bin/env python3
"""
OpenWakeWord background detection worker for Nova Assistant.
Reads 16kHz 16-bit mono raw PCM from stdin and outputs JSON detections to stdout.
"""
import sys
import json
import numpy as np

try:
    import openwakeword
    from openwakeword.model import Model

    # Initialize openWakeWord model
    # Can load default pretrained models or custom models
    model = Model()
    print(json.dumps({"status": "ready", "engine": "openwakeword"}), flush=True)

    CHUNK_SIZE = 1280  # 80ms at 16kHz

    while True:
        raw_bytes = sys.stdin.buffer.read(CHUNK_SIZE * 2)
        if not raw_bytes:
            break

        audio_data = np.frombuffer(raw_bytes, dtype=np.int16)
        prediction = model.predict(audio_data)

        for mdl_name, score in model.prediction_buffer.items():
            current_score = score[-1] if len(score) > 0 else 0
            if current_score > 0.5:
                print(json.dumps({
                    "detected": True,
                    "wakeWord": mdl_name,
                    "score": float(current_score)
                }), flush=True)

except ImportError:
    # If openwakeword is not installed in the python environment, output offline status
    print(json.dumps({
        "status": "unavailable",
        "message": "openwakeword python package not installed. Using local acoustic detector."
    }), flush=True)
    sys.exit(0)
