// Script to get Google Search Console API refresh token (OAuth 2.0)
// Run: node scripts/get-google-refresh-token.js path/to/oauth-client.json

import { OAuth2Client } from 'google-auth-library';
import { readFileSync, existsSync } from 'fs';
import http from 'http';
import { parse } from 'url';

const PORT = 3000;
const REDIRECT_URI = `http://localhost:${PORT}/oauth/callback`;
const SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly';

async function getRefreshToken(oauthClientPath) {
  try {
    // Read the OAuth client credentials file
    const oauthConfig = JSON.parse(readFileSync(oauthClientPath, 'utf8'));

    // Extract credentials (could be in web or installed format)
    const credentials = oauthConfig.web || oauthConfig.installed;

    if (!credentials) {
      throw new Error('Invalid OAuth client file. Expected "web" or "installed" credentials.');
    }

    const { client_id, client_secret } = credentials;

    if (!client_id || !client_secret) {
      throw new Error('Missing client_id or client_secret in OAuth client file.');
    }

    // Create OAuth2 client
    const oauth2Client = new OAuth2Client(
      client_id,
      client_secret,
      REDIRECT_URI
    );

    // Generate authorization URL
    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline', // Required for refresh token
      scope: SCOPE,
      prompt: 'consent', // Force consent screen to get refresh token
    });

    console.log('\n🔐 Starting OAuth 2.0 Authorization Flow...\n');
    console.log('📝 Steps:');
    console.log('1. Your browser will open with Google authorization page');
    console.log('2. Sign in with the Google account that has Search Console access');
    console.log('3. Grant permissions to access Search Console data');
    console.log('4. You will be redirected back to localhost');
    console.log('5. The authorization will complete automatically\n');
    console.log('⚠️  Important: The Google account must have "Owner" permission');
    console.log('   on the getonapod.com Search Console property.\n');

    // Start local HTTP server to handle OAuth callback
    const server = await startCallbackServer(oauth2Client, client_id, client_secret);

    // Display authorization URL
    console.log('🌐 Please visit this URL in your browser to authorize:\n');
    console.log(authUrl);
    console.log('\n⏳ Waiting for authorization...\n');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

function startCallbackServer(oauth2Client, clientId, clientSecret) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      try {
        const parsedUrl = parse(req.url, true);

        // Handle OAuth callback
        if (parsedUrl.pathname === '/oauth/callback') {
          const code = parsedUrl.query.code;

          if (!code) {
            const error = parsedUrl.query.error || 'No authorization code received';
            res.writeHead(400, { 'Content-Type': 'text/html' });
            res.end(`
              <html>
                <head><title>Authorization Failed</title></head>
                <body style="font-family: sans-serif; padding: 40px;">
                  <h1>❌ Authorization Failed</h1>
                  <p>Error: ${error}</p>
                  <p>You can close this window and try again.</p>
                </body>
              </html>
            `);
            server.close();
            reject(new Error(error));
            return;
          }

          // Exchange authorization code for tokens
          console.log('✓ Authorization code received');
          console.log('🔄 Exchanging code for tokens...\n');

          const { tokens } = await oauth2Client.getToken(code);

          if (!tokens.refresh_token) {
            throw new Error('No refresh token received. Make sure access_type is "offline" and prompt is "consent".');
          }

          // Success! Display tokens
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(`
            <html>
              <head><title>Authorization Successful</title></head>
              <body style="font-family: sans-serif; padding: 40px;">
                <h1>✅ Authorization Complete!</h1>
                <p>You can close this window and return to the terminal.</p>
                <p style="color: #666;">Your refresh token has been generated successfully.</p>
              </body>
            </html>
          `);

          // Display results in terminal
          console.log('✅ Authorization Complete!\n');
          console.log('═══════════════════════════════════════════════════════════════');
          console.log('\n📦 OAuth 2.0 Credentials:\n');
          console.log('Refresh Token:');
          console.log(tokens.refresh_token);
          console.log('\nClient ID:');
          console.log(clientId);
          console.log('\nClient Secret:');
          console.log(clientSecret);
          console.log('\n═══════════════════════════════════════════════════════════════\n');
          console.log('📝 Set these secrets in Supabase:\n');
          console.log(`npx supabase secrets set \\`);
          console.log(`  GOOGLE_SEARCH_CONSOLE_REFRESH_TOKEN="${tokens.refresh_token}" \\`);
          console.log(`  GOOGLE_SEARCH_CONSOLE_CLIENT_ID="${clientId}" \\`);
          console.log(`  GOOGLE_SEARCH_CONSOLE_CLIENT_SECRET="${clientSecret}"`);
          console.log('\n═══════════════════════════════════════════════════════════════\n');
          console.log('⚠️  Important Notes:');
          console.log('   • Refresh token does NOT expire (unless you revoke access)');
          console.log('   • Store these credentials securely in Supabase secrets');
          console.log('   • Never commit these values to git');
          console.log('   • The Edge Function will use the refresh token to get access tokens\n');
          console.log('🎉 You can now deploy the check-indexing-status Edge Function!\n');

          // Close server
          server.close();
          resolve(server);

        } else {
          // Handle other paths
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('Not Found');
        }

      } catch (error) {
        console.error('\n❌ Error during authorization:', error.message);
        res.writeHead(500, { 'Content-Type': 'text/html' });
        res.end(`
          <html>
            <head><title>Error</title></head>
            <body style="font-family: sans-serif; padding: 40px;">
              <h1>❌ Error</h1>
              <p>${error.message}</p>
              <p>Check the terminal for details.</p>
            </body>
          </html>
        `);
        server.close();
        reject(error);
      }
    });

    server.listen(PORT, () => {
      console.log(`✓ Local server started on http://localhost:${PORT}`);
      resolve(server);
    });

    server.on('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        console.error(`\n❌ Port ${PORT} is already in use.`);
        console.error('   Please close the application using this port and try again.\n');
      } else {
        console.error('\n❌ Server error:', error.message);
      }
      reject(error);
    });
  });
}

// Get OAuth client file path from command line
const oauthClientPath = process.argv[2];

if (!oauthClientPath) {
  console.error('\n❌ Usage: node scripts/get-google-refresh-token.js path/to/oauth-client.json\n');
  console.error('Steps to get OAuth client credentials:');
  console.error('1. Go to https://console.cloud.google.com/');
  console.error('2. Navigate to "APIs & Services" > "Credentials"');
  console.error('3. Click "Create Credentials" > "OAuth client ID"');
  console.error('4. Application type: "Web application"');
  console.error('5. Add redirect URI: http://localhost:3000/oauth/callback');
  console.error('6. Download the JSON file\n');
  process.exit(1);
}

if (!existsSync(oauthClientPath)) {
  console.error(`\n❌ OAuth client file not found: ${oauthClientPath}\n`);
  process.exit(1);
}

getRefreshToken(oauthClientPath);
