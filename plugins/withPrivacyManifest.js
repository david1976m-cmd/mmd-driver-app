const { withXcodeProject } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const PRIVACY_MANIFEST = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
<key>NSPrivacyTracking</key>
<false/>
<key>NSPrivacyTrackingDomains</key>
<array/>
<key>NSPrivacyCollectedDataTypes</key>
<array>
  <dict>
    <key>NSPrivacyCollectedDataType</key>
    <string>NSPrivacyCollectedDataTypeEmailAddress</string>
    <key>NSPrivacyCollectedDataTypeLinked</key>
    <true/>
    <key>NSPrivacyCollectedDataTypeTracking</key>
    <false/>
    <key>NSPrivacyCollectedDataTypePurposes</key>
    <array>
      <string>NSPrivacyCollectedDataTypePurposeAppFunctionality</string>
      <string>NSPrivacyCollectedDataTypePurposeAccountManagement</string>
    </array>
  </dict>
  <dict>
    <key>NSPrivacyCollectedDataType</key>
    <string>NSPrivacyCollectedDataTypeUserID</string>
    <key>NSPrivacyCollectedDataTypeLinked</key>
    <true/>
    <key>NSPrivacyCollectedDataTypeTracking</key>
    <false/>
    <key>NSPrivacyCollectedDataTypePurposes</key>
    <array>
      <string>NSPrivacyCollectedDataTypePurposeAppFunctionality</string>
      <string>NSPrivacyCollectedDataTypePurposeAccountManagement</string>
    </array>
  </dict>
  <dict>
    <key>NSPrivacyCollectedDataType</key>
    <string>NSPrivacyCollectedDataTypeDeviceID</string>
    <key>NSPrivacyCollectedDataTypeLinked</key>
    <true/>
    <key>NSPrivacyCollectedDataTypeTracking</key>
    <false/>
    <key>NSPrivacyCollectedDataTypePurposes</key>
    <array>
      <string>NSPrivacyCollectedDataTypePurposeAppFunctionality</string>
      <string>NSPrivacyCollectedDataTypePurposeDeveloperAdvertising</string>
    </array>
  </dict>
</array>
<key>NSPrivacyAccessedAPITypes</key>
<array>
  <dict>
    <key>NSPrivacyAccessedAPIType</key>
    <string>NSPrivacyAccessedAPICategoryUserDefaults</string>
    <key>NSPrivacyAccessedAPITypeReasons</key>
    <array>
      <string>CA92.1</string>
    </array>
  </dict>
</array>
</dict>
</plist>
`;

module.exports = function withPrivacyManifest(config) {
return withXcodeProject(config, (config) => {
  const projectRoot = config.modRequest.projectRoot;
  const projectName = config.modRequest.projectName ?? 'MatchMyDriver';
  const targetPath = path.join(projectRoot, 'ios', projectName, 'PrivacyInfo.xcprivacy');

  const dir = path.dirname(targetPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(targetPath, PRIVACY_MANIFEST);

  return config;
});
};