#!/usr/bin/env python3
"""
OpenWakeWord background detection worker for Sora Assistant.
Reads 16kHz 16-bit mono raw PCM from stdin and outputs JSON detections to stdout.
"""
import sys
import os
import json
import warnings

# Suppress ONNX runtime / TF warnings
os.environ['ORT_LOGGING_LEVEL'] = '3'
warnings.filterwarnings('ignore')

try:
    import numpy as np
    import openwakeword
    from openwakeword.model import Model

    # Initialize openWakeWord with proven pre-trained wake words
    model = Model()
    models_loaded = list(model.models.keys())
    print(json.dumps({"status": "ready", "engine": "openwakeword", "models": models_loaded}), flush=True)

    CHUNK_SIZE = 1280  # 80ms at 16kHz

    while True:
        raw_bytes = sys.stdin.buffer.read(CHUNK_SIZE * 2)
        if not raw_bytes:
            break

        audio_data = np.frombuffer(raw_bytes, dtype=np.int16)
        model.predict(audio_data)

        # Check predictions for proven wake words
        for mdl_name in ['hey_jarvis', 'alexa', 'hey_mycroft']:
            if mdl_name in model.prediction_buffer:
                scores = model.prediction_buffer[mdl_name]
                current_score = scores[-1] if len(scores) > 0 else 0
                if current_score > 0.4:
                    print(json.dumps({
                        "detected": True,
                        "wakeWord": mdl_name,
                        "score": float(current_score)
                    }), flush=True)

except ImportError as e:
    print(json.dumps({
        "status": "unavailable",
        "message": f"openwakeword import error: {e}"
    }), flush=True)
    sys.exit(0)
