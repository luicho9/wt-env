import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest


CLI = Path(__file__).resolve().parents[1] / "wtenv"


class ClipCommandTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        self.source = self.root / "source.mp4"
        self.output = self.root / "cut.mp4"
        self.events = self.root / "events.json"
        self.events.write_text("[]")

    def cut(self, output=None, speed=None, **kwargs):
        return subprocess.run(
            [sys.executable, str(CLI), "clip", "cut", str(self.source),
             "--events", str(self.events), "--started-at", "2026-01-01T00:00:00Z",
             "-o", str(output or self.output)] + ([] if speed is None else ["--speed", str(speed)]),
            capture_output=True, text=True, **kwargs,
        )

    def test_output_cannot_overwrite_source_or_hardlink(self):
        self.source.write_bytes(b"original recording")
        self.output.hardlink_to(self.source)
        for output in (self.source, self.output):
            with self.subTest(output=output):
                result = self.cut(output)
                self.assertNotEqual(result.returncode, 0)
                self.assertEqual(self.source.read_bytes(), b"original recording")

    def test_malformed_log_falls_back_to_original(self):
        self.source.write_bytes(b"original recording")
        self.events.write_text("{invalid")
        result = self.cut()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertFalse(json.loads(result.stdout)["cut"])
        self.assertEqual(self.output.read_bytes(), self.source.read_bytes())

    def test_missing_media_tools_falls_back_to_original(self):
        self.source.write_bytes(b"original recording")
        result = self.cut(env={"PATH": str(self.root)})
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertFalse(json.loads(result.stdout)["cut"])
        self.assertEqual(self.output.read_bytes(), self.source.read_bytes())

    @unittest.skipUnless(shutil.which("ffmpeg") and shutil.which("ffprobe"), "requires ffmpeg")
    def test_actions_keep_results_and_remove_idle_time(self):
        subprocess.run(
            ["ffmpeg", "-v", "error", "-f", "lavfi", "-i",
             "testsrc2=size=160x90:rate=10:duration=10", "-vf",
             r"select=eq(n\,0)+between(n\,10\,15)+eq(n\,50)+between(n\,80\,83)+eq(n\,99)", "-fps_mode", "vfr", str(self.source)], check=True,
        )
        epoch_ms = 1767225600000
        self.events.write_text(json.dumps([
            {"t": epoch_ms + 1000, "kind": "move"},
            {"t": epoch_ms + 3000, "kind": "change"},
            {"t": epoch_ms + 6000, "kind": "typing"},
        ]))
        for speed in (None, 1):
            with self.subTest(speed=speed):
                result = self.cut(speed=speed)
                self.assertEqual(result.returncode, 0, result.stderr)
                report = json.loads(result.stdout)
                self.assertTrue(report["cut"], report)
                self.assertEqual(report["segments"], [[0.75, 4.0], [5.75, 8.5]])
                duration = float(subprocess.check_output([
                    "ffprobe", "-v", "error", "-show_entries", "format=duration",
                    "-of", "csv=p=0", str(self.output)], text=True))
                self.assertAlmostEqual(duration, 8.0 if speed is None else 6.0, delta=0.2)


if __name__ == "__main__":
    unittest.main()
