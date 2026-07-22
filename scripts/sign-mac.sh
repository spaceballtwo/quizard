#!/bin/bash
# Sign + notarize + staple the Mac app. Run from ssat-app/.
#
# ONE-TIME SETUP (do these once, in Terminal, yourself — passwords never go in chat):
#   1. Cert: Xcode > Settings > Accounts > [dad's Apple ID] > Manage Certificates > + > Developer ID Application
#      (or on developer.apple.com > Certificates with a Keychain CSR if Xcode isn't installed yet)
#   2. App-specific password: appleid.apple.com > Sign-In & Security > App-Specific Passwords > make one
#   3. Store it for notary:  xcrun notarytool store-credentials quizard-notary \
#        --apple-id "DAD_APPLE_ID" --team-id "TEAMID" --password "app-specific-password"
#
# THEN:  ./scripts/sign-mac.sh "Developer ID Application: Name (TEAMID)"
set -euo pipefail
APP="build.noindex/Quizard.app"
IDENTITY="${1:?usage: sign-mac.sh \"Developer ID Application: Name (TEAMID)\" [notary-profile]}"
PROFILE="${2:-quizard-notary}"

cp index.html "$APP/Contents/Resources/index.html"
codesign --force --deep --options runtime --timestamp --sign "$IDENTITY" "$APP"
codesign --verify --deep --strict "$APP" && echo "signature OK"

ditto -c -k --keepParent "$APP" /tmp/Quizard-signed.zip
xcrun notarytool submit /tmp/Quizard-signed.zip --keychain-profile "$PROFILE" --wait
xcrun stapler staple "$APP"

ditto -c -k --keepParent "$APP" "$HOME/Desktop/Quizard-beta.zip"
echo "DONE: signed, notarized, stapled -> ~/Desktop/Quizard-beta.zip (no more 'Open Anyway')"
