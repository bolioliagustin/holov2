# ──────────────────────────────────────────────────────────────────────
# HoloNFC · Bridge Lector NFC Físico para Windows
# ──────────────────────────────────────────────────────────────────────
# Este script se conecta directamente al lector USB ACR122U usando la
# API nativa de Windows (winscard.dll) y reenvía las lecturas al servidor
# local sin necesidad de compilar dependencias C++ en Node.js.
# ──────────────────────────────────────────────────────────────────────

$source = @"
using System;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

public class NFCBridge {
    [DllImport("winscard.dll")]
    public static extern int SCardEstablishContext(uint dwScope, IntPtr pvReserved1, IntPtr pvReserved2, out IntPtr phContext);
    [DllImport("winscard.dll")]
    public static extern int SCardReleaseContext(IntPtr hContext);
    [DllImport("winscard.dll")]
    public static extern int SCardConnect(IntPtr hContext, string szReader, uint dwShareMode, uint dwPreferredProtocols, out IntPtr phCard, out uint pdwActiveProtocol);
    [DllImport("winscard.dll")]
    public static extern int SCardDisconnect(IntPtr hCard, uint dwDisposition);
    [DllImport("winscard.dll")]
    public static extern int SCardListReaders(IntPtr hContext, string mszGroups, byte[] mszReaders, ref uint pcchReaders);
    [DllImport("winscard.dll")]
    public static extern int SCardTransmit(IntPtr hCard, ref SCARD_IO_REQUEST pioSendPci, byte[] pbSendBuffer, uint cbSendLength, ref SCARD_IO_REQUEST pioRecvPci, byte[] pbRecvBuffer, ref uint pcbRecvLength);

    [StructLayout(LayoutKind.Sequential)]
    public struct SCARD_IO_REQUEST {
        public uint dwProtocol;
        public uint cbPciLength;
    }

    public static void StartLoop(Action<string> onCardDetected) {
        IntPtr hContext = IntPtr.Zero;
        int ret = SCardEstablishContext(0, IntPtr.Zero, IntPtr.Zero, out hContext);
        if (ret != 0) {
            Console.WriteLine("[NFC Bridge] Error al iniciar contexto de Smart Card. ¿Está encendido el servicio de Tarjetas Inteligentes?");
            return;
        }

        Console.WriteLine("[NFC Bridge] Buscando lector ACR122U / NFC USB...");
        string readerName = null;
        
        while (readerName == null) {
            uint pcchReaders = 0;
            SCardListReaders(hContext, null, null, ref pcchReaders);
            if (pcchReaders > 0) {
                byte[] mszReaders = new byte[pcchReaders];
                if (SCardListReaders(hContext, null, mszReaders, ref pcchReaders) == 0) {
                    string s = Encoding.ASCII.GetString(mszReaders);
                    string[] parts = s.Split('\0');
                    foreach (string p in parts) {
                        if (!string.IsNullOrEmpty(p) && (p.ToLower().Contains("acr122") || p.ToLower().Contains("nfc") || p.ToLower().Contains("reader"))) {
                            readerName = p;
                            break;
                        }
                    }
                }
            }
            if (readerName == null) {
                Thread.Sleep(1000);
            }
        }

        Console.WriteLine("[NFC Bridge] Lector conectado: " + readerName);
        Console.WriteLine("[NFC Bridge] >>> ESPERANDO PULSERAS / TARJETAS NFC <<<");

        string lastUid = "";
        DateTime lastTime = DateTime.MinValue;

        while (true) {
            IntPtr hCard = IntPtr.Zero;
            uint activeProto = 0;
            // 2 = SHARE_SHARED, 3 = PROTOCOL_T0 | PROTOCOL_T1
            ret = SCardConnect(hContext, readerName, 2, 3, out hCard, out activeProto);
            if (ret == 0) {
                // APDU de lectura de UID para ACR122U (FF CA 00 00 00)
                byte[] sendBytes = new byte[] { 0xFF, 0xCA, 0x00, 0x00, 0x00 };
                byte[] recvBytes = new byte[258];
                uint recvLen = (uint)recvBytes.Length;

                SCARD_IO_REQUEST ioRequest = new SCARD_IO_REQUEST();
                ioRequest.dwProtocol = activeProto;
                ioRequest.cbPciLength = 8;

                SCARD_IO_REQUEST ioRequestRecv = new SCARD_IO_REQUEST();
                ioRequestRecv.dwProtocol = activeProto;
                ioRequestRecv.cbPciLength = 8;

                ret = SCardTransmit(hCard, ref ioRequest, sendBytes, (uint)sendBytes.Length, ref ioRequestRecv, recvBytes, ref recvLen);
                if (ret == 0 && recvLen >= 2) {
                    int sw1 = recvBytes[recvLen - 2];
                    int sw2 = recvBytes[recvLen - 1];
                    if (sw1 == 0x90 && sw2 == 0x00) {
                        StringBuilder sb = new StringBuilder();
                        for (int i = 0; i < recvLen - 2; i++) {
                            sb.Append(recvBytes[i].ToString("X2"));
                        }
                        string uid = sb.ToString();
                        
                        // Debounce de 2.5s para evitar dobles lecturas instantáneas
                        if (uid != lastUid || (DateTime.Now - lastTime).TotalMilliseconds > 2500) {
                            lastUid = uid;
                            lastTime = DateTime.Now;
                            onCardDetected(uid);
                        }
                    }
                }
                SCardDisconnect(hCard, 0); // 0 = LEAVE_CARD
            }
            Thread.Sleep(250);
        }
    }
}
"@

# Compilar C# al vuelo
Add-Type -TypeDefinition $source

$onCard = {
    param($uid)
    Write-Host "[NFC Bridge] ¡Tarjeta leída! UID: $uid" -ForegroundColor Green
    
    # Reenviar al servidor local en puerto 3000
    try {
        $body = @{ uid = $uid } | ConvertTo-Json
        $response = Invoke-RestMethod -Uri "http://localhost:3000/api/nfc/trigger" -Method Post -Body $body -ContentType "application/json" -TimeoutSec 2
        Write-Host "             Enviado a HoloNFC server: OK" -ForegroundColor DarkGreen
    } catch {
        Write-Host "             Error: El servidor local de HoloNFC (puerto 3000) no responde." -ForegroundColor Yellow
    }
}

# Ejecutar el bucle de escucha
[NFCBridge]::StartLoop($onCard)
