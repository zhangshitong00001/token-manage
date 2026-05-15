"""File hashing utility with chunked reading and algorithm validation."""

import hashlib
from pathlib import Path

SUPPORTED_ALGORITHMS = frozenset({"md5", "sha1", "sha256", "sha512"})


def compute_file_hash(filepath: str, algorithm: str = "sha256") -> str:
    """Compute the hex digest of a file using the specified hash algorithm.

    Args:
        filepath: Path to the target file.
        algorithm: One of 'md5', 'sha1', 'sha256', 'sha512'.

    Returns:
        Hex digest string.

    Raises:
        FileNotFoundError: If the file does not exist.
        ValueError: If the algorithm is not supported.
    """
    if algorithm not in SUPPORTED_ALGORITHMS:
        raise ValueError(
            f"Unsupported algorithm: {algorithm!r}. "
            f"Supported: {', '.join(sorted(SUPPORTED_ALGORITHMS))}"
        )

    path = Path(filepath)
    if not path.exists():
        raise FileNotFoundError(f"File not found: {filepath}")
    if not path.is_file():
        raise FileNotFoundError(f"Not a file: {filepath}")

    hasher = hashlib.new(algorithm)
    # Read in 64 KiB chunks to handle large files without memory spikes.
    with path.open("rb") as f:
        while chunk := f.read(65536):
            hasher.update(chunk)

    return hasher.hexdigest()
