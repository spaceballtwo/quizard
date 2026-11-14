#!/bin/zsh
# Archives Quizard build 11 (v1.1) and uploads it to App Store Connect.
# Run this in YOUR Terminal (not from any other app) so macOS can show
# the keychain prompt — click "Always Allow" if it appears.
set -e
cd "$(dirname "$0")"
export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer
echo "==> Archiving (1-3 minutes)…"
xcodebuild -scheme Quizard -configuration Release \
  -archivePath ./build/Quizard11.xcarchive \
  -destination 'generic/platform=iOS' \
  -allowProvisioningUpdates DEVELOPMENT_TEAM=CMLTHS6KAU archive | tail -2
echo "==> Uploading to App Store Connect…"
xcodebuild -exportArchive \
  -archivePath ./build/Quizard11.xcarchive \
  -exportOptionsPlist ./ExportOptions.plist \
  -allowProvisioningUpdates | tail -5
echo ""
echo "DONE. Build 1.1 (11) is uploading — check App Store Connect in ~15 minutes."
