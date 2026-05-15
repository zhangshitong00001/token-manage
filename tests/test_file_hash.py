"""Tests for file_hash.compute_file_hash."""

from pathlib import Path

import pytest

from file_hash import compute_file_hash, SUPPORTED_ALGORITHMS

FIXTURES = Path(__file__).parent / "fixtures"

# Pre-computed expected hashes for the known fixture files.
# computed: md5("This is a normal test fixture file with known content.\n...")
EXPECTED_NORMAL = {
    "md5": "5f4bec0e02c4a19c5f7a84e9fceb8171",
    "sha1": "f6a2beb02c428aa25dfef558b1409c9dc9272a08",
    "sha256": "454812b8fcdc6c04954ac350e70d6dc7016731c73a1ac56c4e42c6b40cfa8076",
    "sha512": "d5e924a1088300b3fdc96457d9c3c51e00ba12c1426c70ce627728a99e318ee7087c171dec4c8e8b02c1e7c01492f8980d292b75b12f7b5f216c0337571a3d39",
}

# Empty-file digests per algorithm.
EXPECTED_EMPTY = {
    "md5": "d41d8cd98f00b204e9800998ecf8427e",
    "sha1": "da39a3ee5e6b4b0d3255bfef95601890afd80709",
    "sha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    "sha512": "cf83e1357eefb8bdf1542850d66d8007d620e4050b5715dc83f4a921d36ce9ce47d0d13c5d85f2b0ff8318d2877eec2f63b931bd47417a81a538327af927da3e",
}

# Pre-computed hashes for the ~105 MB large fixture file.
EXPECTED_LARGE = {
    "md5": "a9b59b0a5fe1ffed0b23fad2498c4dac",
    "sha1": "501568be9ca9311a78328fd5cd14b535e26ce156",
    "sha256": "076bc278798bc72e32d5515ad9e33db60545e707f5cd2e9da7ebdfb7bf9d2822",
    "sha512": "6651b52a7e6f9efed23aa18452dc03cc564d2b67d83e2bbc9dd2b88fe5e1df54c96f02a0cbf373613ddd42cda92b592efbe51346a1dbe3ee115aa5d7b20b9961",
}


# ── 1. Normal file returns correct hash ────────────────────────────────────


class TestNormalFile:
    """Happy-path: a normal (non-empty, non-huge) file returns expected digests."""

    def test_md5(self):
        assert compute_file_hash(str(FIXTURES / "normal_file.txt"), "md5") == EXPECTED_NORMAL["md5"]

    def test_sha1(self):
        assert compute_file_hash(str(FIXTURES / "normal_file.txt"), "sha1") == EXPECTED_NORMAL["sha1"]

    def test_sha256(self):
        assert (
            compute_file_hash(str(FIXTURES / "normal_file.txt"), "sha256")
            == EXPECTED_NORMAL["sha256"]
        )

    def test_sha512(self):
        assert (
            compute_file_hash(str(FIXTURES / "normal_file.txt"), "sha512")
            == EXPECTED_NORMAL["sha512"]
        )

    def test_default_algorithm_is_sha256(self):
        """Calling without an algorithm argument defaults to sha256."""
        assert compute_file_hash(str(FIXTURES / "normal_file.txt")) == EXPECTED_NORMAL["sha256"]

    def test_all_supported_algorithms(self):
        """All 4 supported algorithms work on a real file."""
        for algo in sorted(SUPPORTED_ALGORITHMS):
            result = compute_file_hash(str(FIXTURES / "normal_file.txt"), algo)
            assert result == EXPECTED_NORMAL[algo], f"Mismatch for {algo}"


# ── 2. Empty file returns empty hash ───────────────────────────────────────


class TestEmptyFile:
    """An empty file should produce the algorithm's known empty/zero digest."""

    def test_md5(self):
        assert compute_file_hash(str(FIXTURES / "empty_file.txt"), "md5") == EXPECTED_EMPTY["md5"]

    def test_sha1(self):
        assert compute_file_hash(str(FIXTURES / "empty_file.txt"), "sha1") == EXPECTED_EMPTY["sha1"]

    def test_sha256(self):
        assert (
            compute_file_hash(str(FIXTURES / "empty_file.txt"), "sha256")
            == EXPECTED_EMPTY["sha256"]
        )

    def test_sha512(self):
        assert (
            compute_file_hash(str(FIXTURES / "empty_file.txt"), "sha512")
            == EXPECTED_EMPTY["sha512"]
        )


# ── 3. Large file computes correctly ───────────────────────────────────────


class TestLargeFile:
    """A ~105 MB file must hash without timeout, OOM, or crash."""

    def test_large_file_sha256(self):
        result = compute_file_hash(str(FIXTURES / "large_file.bin"), "sha256")
        assert result == EXPECTED_LARGE["sha256"]

    def test_large_file_md5(self):
        result = compute_file_hash(str(FIXTURES / "large_file.bin"), "md5")
        assert result == EXPECTED_LARGE["md5"]

    def test_large_file_all_algorithms(self):
        for algo in sorted(SUPPORTED_ALGORITHMS):
            result = compute_file_hash(str(FIXTURES / "large_file.bin"), algo)
            assert result == EXPECTED_LARGE[algo], f"Mismatch for {algo} on large file"


# ── 4. Non-existent file raises FileNotFoundError ──────────────────────────


class TestMissingFile:
    """Accessing a nonexistent path must raise FileNotFoundError."""

    def test_nonexistent_path(self):
        path = str(FIXTURES / "does_not_exist_xyz.txt")
        with pytest.raises(FileNotFoundError):
            compute_file_hash(path)

    def test_nonexistent_directory(self):
        path = str(FIXTURES / "nope" / "file.txt")
        with pytest.raises(FileNotFoundError):
            compute_file_hash(path)

    def test_directory_instead_of_file(self, tmp_path):
        """A path that exists but is a directory should also raise."""
        d = tmp_path / "a_dir"
        d.mkdir()
        with pytest.raises(FileNotFoundError):
            compute_file_hash(str(d))


# ── 5. Unsupported algorithm raises ValueError ─────────────────────────────


class TestUnsupportedAlgorithm:
    """An algorithm not in SUPPORTED_ALGORITHMS must raise ValueError."""

    def test_unsupported_name(self):
        with pytest.raises(ValueError, match="Unsupported algorithm"):
            compute_file_hash(str(FIXTURES / "normal_file.txt"), "blake2b")

    def test_empty_string_algorithm(self):
        with pytest.raises(ValueError, match="Unsupported algorithm"):
            compute_file_hash(str(FIXTURES / "normal_file.txt"), "")

    def test_none_algorithm(self):
        with pytest.raises(ValueError, match="Unsupported algorithm"):
            compute_file_hash(str(FIXTURES / "normal_file.txt"), None)  # type: ignore[arg-type]

    def test_case_sensitivity(self):
        """Algorithms are expected case-sensitively per the SUPPORTED_ALGORITHMS set."""
        with pytest.raises(ValueError, match="Unsupported algorithm"):
            compute_file_hash(str(FIXTURES / "normal_file.txt"), "SHA256")
