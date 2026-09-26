$res = Invoke-RestMethod -Uri 'https://discordlookup.mesavirep.xyz/v1/user/1282691175085637632'
ConvertTo-Json -InputObject $res -Depth 5
