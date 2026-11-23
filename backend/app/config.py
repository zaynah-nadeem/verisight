"""
Central app configuration.

Everything here can be changed from backend/.env without touching the code, for example:
    SECOND_MODEL_QUANTIZE=true
    VIDEO_FRAMES=2
"""
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    environment: str = "development"

    # Used to sign login tokens. Put a long random value in backend/.env as
    # SECRET_KEY=... before showing this to anyone. Anyone who knows it can forge logins.
    secret_key: str = "dev-secret-change-me-later-this-is-only-for-local-testing"

    # Default is a local SQLite file; backend/.env points it at PostgreSQL.
    database_url: str = "sqlite:///./deepfake.db"

    upload_dir: str = "uploads"

    # Login tokens last 7 days
    token_expire_minutes: int = 60 * 24 * 7

    # Free scans for people who are not signed in (counted per phone)
        # Free scans for people who are not signed in (counted per phone)
    guest_scan_limit: int = 3

    # ------------------------------------------------------------------
    # Forgot password (the code is sent by e-mail)
    # ------------------------------------------------------------------
    app_name: str = "Verisight"
    # Gmail: smtp.gmail.com / 587, user = your Gmail address, password = a Google "app password".
    # If smtp_user or smtp_password is empty, nothing is e-mailed: the code is printed in the
    # backend window instead (handy while testing).
    smtp_host: str = "smtp.gmail.com"
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    reset_code_minutes: int = 15

    # ------------------------------------------------------------------
    # Detector settings
    # ------------------------------------------------------------------

    # Folder holding your own trained models (the three .onnx files and video_model_final.pt)
    models_dir: str = "models"

    # The main detector (a general "is this AI-generated?" model, ~2 GB, CPU: ~40 s per image).
    second_model_enabled: bool = True
    second_model_repo: str = "Bombek1/ai-image-detector-siglip-dinov2"
    # The exact version of the model's code that was reviewed. Pinned so that an update on
    # Hugging Face can never change the code that runs on this computer.
    second_model_revision: str = "6455cf791436ee914c9556ab71578cce9761fef7"
    # int8 compression: usually 2-3x faster on a CPU, scores can shift a little.
    # Test it with bench_models.py before turning it on.
    # int8 compression. It did NOT work with this model (error on the first test), so keep it off.
    second_model_quantize: bool = False
    # The model's own code loads its SigLIP part in bfloat16, which is slow on CPUs without
    # hardware support for it. True converts it to normal 32-bit numbers (usually faster on a CPU).
    # Test it with bench_models.py --float32 before turning it on.
    second_model_float32: bool = False

    # CPU threads used by PyTorch / ONNX. 0 = let the program choose (all cores).
    cpu_threads: int = 0

    # Your own image models (EfficientNet-B4 + Xception41 + ViT-Base), run on detected faces only
    face_models_enabled: bool = True
    # Your own video model (EfficientNet-B4), a small extra vote for videos
    video_model_enabled: bool = True

     # Photos and video frames are shrunk so their long side is at most this many pixels before the
    # main detector sees them (phone photos are huge and heavily processed). 0 = do not shrink.
    main_max_side: int = 1024
    video_frames: int = 4

    # Older general model (Community Forensics). Off: it missed modern generators in our tests.
    commfor_enabled: bool = False

    # Load the detectors in the background when the server starts, so the first scan is not slow.
    # (They still wait for their turn if a scan arrives before loading has finished.)
    warmup_on_start: bool = True

    # Remember results by file fingerprint, so scanning the same file again is instant
    cache_enabled: bool = True
    cache_dir: str = "cache"

    # What the AI-likelihood of the main detector means (0-1):
    #   below real_below   -> "likely authentic"
    #   above ai_above     -> "likely AI-generated"
    #   in between         -> "inconclusive"
    real_below: float = 0.35
    ai_above: float = 0.65

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()