from flask import Flask, request, jsonify
import sqlite3
import os

app = Flask(__name__)

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
db_path = os.path.join(BASE_DIR, "database.db")

def init_db():
    conn = sqlite3.connect(db_path)
    c = conn.cursor()
    c.execute('''CREATE TABLE IF NOT EXISTS users (
                    discord_id INTEGER PRIMARY KEY,
                    license_key TEXT,
                    hwid TEXT
                 )''')
    conn.commit()
    conn.close()

init_db()

@app.route('/api/auth', methods=['POST'])
def auth():
    data = request.get_json()
    license_key = data.get("license")
    hwid = data.get("hwid")
    
    if not license_key or not hwid:
        return jsonify({"status": "error", "message": "Missing license or hwid"}), 400
        
    conn = sqlite3.connect(db_path)
    c = conn.cursor()
    c.execute("SELECT discord_id, hwid FROM users WHERE license_key = ?", (license_key,))
    row = c.fetchone()
    
    if not row:
        conn.close()
        return jsonify({"status": "error", "message": "Invalid license key"}), 403
        
    discord_id, db_hwid = row
    
    if db_hwid is None:
        c.execute("UPDATE users SET hwid = ? WHERE license_key = ?", (hwid, license_key))
        conn.commit()
        conn.close()
        return jsonify({"status": "success", "message": "HWID locked successfully!"})
    elif db_hwid == hwid:
        conn.close()
        return jsonify({"status": "success", "message": "Authenticated"})
    else:
        conn.close()
        return jsonify({"status": "error", "message": "Invalid HWID. Please request a reset."}), 403

if __name__ == '__main__':
    app.run(port=8081)
