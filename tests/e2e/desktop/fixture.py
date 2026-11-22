from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from json import dumps
from pathlib import Path
from subprocess import DEVNULL, run


class Fixture(BaseHTTPRequestHandler):
    def clipboard(self):
        if self.path == "/vnc/clipboard":
            return ["xclip", "-display", ":99", "-selection", "clipboard"]
        if self.path == "/rdp/clipboard":
            display = Path("/home/fixture/.e2e-rdp-display")
            if display.is_file():
                return ["env", "XAUTHORITY=/home/fixture/.Xauthority", "xclip",
                        "-display", display.read_text().strip(), "-selection", "clipboard"]
        return None

    def do_GET(self):
        if self.path == "/rdp":
            sesman = Path("/var/log/xrdp-sesman.log").read_text()
            xrdp = Path("/var/log/xrdp.log").read_text()
            self.reply(200, dumps({
                "failed": sesman.count("AUTHFAIL: user=fixture "),
                "accepted": xrdp.count("xrdp_wm_log_msg: login successful for user fixture "),
            }).encode())
            return
        xclip = self.clipboard()
        if xclip is None:
            self.reply(404)
            return
        result = run([*xclip, "-out"], capture_output=True, timeout=3)
        self.reply(200 if result.returncode == 0 else 404, result.stdout)

    def do_PUT(self):
        xclip = self.clipboard()
        if xclip is None:
            self.reply(404)
            return
        text = self.rfile.read(int(self.headers["Content-Length"]))
        result = run([*xclip, "-in"], input=text, stdout=DEVNULL, stderr=DEVNULL, timeout=3)
        self.reply(204 if result.returncode == 0 else 503)

    def reply(self, status, body=b""):
        self.send_response(status)
        self.end_headers()
        self.wfile.write(body)


ThreadingHTTPServer(("0.0.0.0", 8000), Fixture).serve_forever()
