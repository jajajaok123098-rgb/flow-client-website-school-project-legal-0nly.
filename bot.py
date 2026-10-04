import discord
from discord.ext import commands
from discord import app_commands
import sqlite3
import uuid
import os
import asyncio
from aiohttp import web
import json

# ================= Configuration =================
BOT_TOKEN = "MTUwOTk3MzEwNjg5MzAwMDgxNQ.GjI9Jz.HGrkcLm8-0w5ARZVO4tHGQpBYt8EFqRHgLIIs8" # Put your token here
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
JAR_PATH = os.path.join(BASE_DIR, "flow-1.0.0-custom-obf.jar")
ALLOWED_ROLES = [1553460026222313563, 1548310822873333800]
WEB_PORT = 8081 # The port for the website/backend

# ================= DB Setup =================
db_path = os.path.join(BASE_DIR, "database.db")
conn = sqlite3.connect(db_path)
c = conn.cursor()
c.execute('''CREATE TABLE IF NOT EXISTS users (
                discord_id INTEGER PRIMARY KEY,
                license_key TEXT,
                hwid TEXT
             )''')
conn.commit()

# ================= Bot Setup =================
intents = discord.Intents.default()
bot = commands.Bot(command_prefix="!", intents=intents)

@bot.event
async def on_ready():
    print(f"[BOT] Logged in as {bot.user}!")
    try:
        synced = await bot.tree.sync()
        print(f"[BOT] Synced {len(synced)} slash command(s).")
    except Exception as e:
        print(f"[BOT] Error syncing commands: {e}")
    
    # Start web server for the HWID auth backend!
    await start_web()

# ================= Web Server Backend =================
async def handle_auth(request):
    try:
        data = await request.json()
        license_key = data.get("license")
        hwid = data.get("hwid")
        
        if not license_key or not hwid:
            return web.json_response({"status": "error", "message": "Missing license or hwid"}, status=400)
            
        c.execute("SELECT discord_id, hwid FROM users WHERE license_key = ?", (license_key,))
        row = c.fetchone()
        
        if not row:
            print(f"[AUTH FAILED] Unknown License Key attempted: {license_key}")
            return web.json_response({"status": "error", "message": "Invalid license key"}, status=403)
            
        discord_id, db_hwid = row
        
        if db_hwid is None:
            # First time logging in, bind the HWID!
            c.execute("UPDATE users SET hwid = ? WHERE license_key = ?", (hwid, license_key))
            conn.commit()
            print(f"[AUTH SUCCESS] Bound new HWID for User {discord_id}")
            return web.json_response({"status": "success", "message": "HWID locked successfully!"})
        elif db_hwid == hwid:
            # HWID matches, welcome back
            print(f"[AUTH SUCCESS] Authenticated User {discord_id}")
            return web.json_response({"status": "success", "message": "Authenticated"})
        else:
            # HWID mismatch, locked to another PC
            print(f"[AUTH FAILED] HWID mismatch for User {discord_id}")
            return web.json_response({"status": "error", "message": "Invalid HWID. Please request a reset."}, status=403)
    except Exception as e:
        return web.json_response({"status": "error", "message": str(e)}, status=500)

app = web.Application()
app.router.add_post('/api/auth', handle_auth)

async def start_web():
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, '0.0.0.0', WEB_PORT)
    await site.start()
    print(f"[WEB] Web server API running on port {WEB_PORT}")

# ================= Bot Commands =================

@bot.tree.command(name="media", description="Give a user the Media role")
@app_commands.describe(member="The user to give the media role to")
async def media_command(interaction: discord.Interaction, member: discord.Member):
    if not interaction.user.guild_permissions.administrator:
        await interaction.response.send_message("❌ You must be an Administrator to use this command.", ephemeral=True)
        return
        
    role_id = 1548310822873333800
    role = interaction.guild.get_role(role_id)
    
    if role is None:
        await interaction.response.send_message("❌ Error: Could not find the Media role. Make sure the ID is correct.", ephemeral=True)
        return
        
    try:
        await member.add_roles(role)
        await interaction.response.send_message(f"🎉 Congratulations {member.mention}! You have been granted the **Media** role! Keep up the great content.")
    except discord.Forbidden:
        await interaction.response.send_message("❌ Error: I don't have permission to do this. Make sure my Bot Role is placed higher than the Media role in your server settings, and that I have the 'Manage Roles' permission.", ephemeral=True)
    except Exception as e:
        await interaction.response.send_message(f"❌ An unexpected error occurred: {e}", ephemeral=True)

@bot.tree.command(name="grant", description="Grant a user a Flow Client license")
@app_commands.describe(member="The user to grant a license to")
async def grant_command(interaction: discord.Interaction, member: discord.Member):
    if not interaction.user.guild_permissions.administrator:
        await interaction.response.send_message("❌ You must be an Administrator to use this command.", ephemeral=True)
        return

    # Generates a license key for the user
    license_key = str(uuid.uuid4())
    c.execute("INSERT OR REPLACE INTO users (discord_id, license_key, hwid) VALUES (?, ?, ?)", 
              (member.id, license_key, None))
    conn.commit()
    
    await interaction.response.send_message(f"✅ Granted license to {member.mention}.\nTheir License Key is: `{license_key}`", ephemeral=True)
    
    # Try to DM the user their key
    try:
        await member.send(f"🎉 You have been granted a license for **Flow Client**!\n\nYour License Key is: `{license_key}`\n\nPlease create a file named `flow_license.txt` inside your `.minecraft` folder and paste this exact key inside it. Keep it secret!")
    except:
        pass # User has DMs disabled

@bot.tree.command(name="reset-hwid", description="Reset a user's HWID")
@app_commands.describe(member="The user whose HWID to reset")
async def reset_hwid_command(interaction: discord.Interaction, member: discord.Member):
    if not interaction.user.guild_permissions.administrator:
        await interaction.response.send_message("❌ You must be an Administrator to use this command.", ephemeral=True)
        return

    c.execute("SELECT hwid FROM users WHERE discord_id = ?", (member.id,))
    row = c.fetchone()
    
    if not row:
        await interaction.response.send_message(f"❌ {member.mention} does not have a license yet!", ephemeral=True)
        return
        
    if row[0] is None:
        await interaction.response.send_message(f"⚠️ {member.mention} hasn't launched the game yet (No HWID set)!", ephemeral=True)
        return
        
    c.execute("UPDATE users SET hwid = NULL WHERE discord_id = ?", (member.id,))
    conn.commit()
    await interaction.response.send_message(f"✅ Successfully reset HWID for {member.mention}.", ephemeral=True)

@bot.tree.command(name="download", description="Download the Flow Client")
async def download_command(interaction: discord.Interaction):
    # 0. Check channel
    ALLOWED_CHANNELS = [1556312756154802286, 1556313296032890931]
    if interaction.channel.id not in ALLOWED_CHANNELS:
        await interaction.response.send_message(f"❌ You can only use this command in <#{ALLOWED_CHANNELS[0]}> or <#{ALLOWED_CHANNELS[1]}>.", ephemeral=True)
        return

    # 1. Check roles
    has_role = False
    for role in interaction.user.roles:
        if role.id in ALLOWED_ROLES:
            has_role = True
            break
            
    if not has_role:
        await interaction.response.send_message("❌ You do not have the required roles to download the client.", ephemeral=True)
        return
        
    # 2. Check if they have a license in the DB
    c.execute("SELECT license_key FROM users WHERE discord_id = ?", (interaction.user.id,))
    row = c.fetchone()
    if not row:
        await interaction.response.send_message("❌ You do not have a license! Ask an admin to use `/grant` to give you one.", ephemeral=True)
        return
        
    # 3. Simulate processing
    await interaction.response.send_message("getting your download...", ephemeral=True)
    await asyncio.sleep(1.5)
    await interaction.edit_original_response(content="prearing personal download..")
    await asyncio.sleep(1.5)
    
    # 4. Inject the license key directly into the JAR securely!
    import io
    import zipfile
    
    if not os.path.exists(JAR_PATH):
        await interaction.edit_original_response(content="❌ Error: The JAR file could not be found on the server.")
        return
        
    # Read the base JAR into memory
    personalized_jar = io.BytesIO()
    with open(JAR_PATH, 'rb') as f:
        personalized_jar.write(f.read())
        
    # Append the license key file inside the zip archive
    with zipfile.ZipFile(personalized_jar, 'a', zipfile.ZIP_DEFLATED) as z:
        z.writestr("flow_license.txt", row[0]) # row[0] is the license_key
        
    personalized_jar.seek(0)
    
    file = discord.File(fp=personalized_jar, filename="FlowClient.jar")
    await interaction.edit_original_response(
        content="✅ Here is your personal download!\n\n**Your license key is securely embedded inside this JAR.** Just drop it into your mods folder and you are ready to play!", 
        attachments=[file]
    )

bot.run(BOT_TOKEN)
