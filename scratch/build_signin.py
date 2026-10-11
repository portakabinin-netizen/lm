def extract_lines(filepath):
    result = {}
    with open(filepath, 'r', encoding='utf-8') as f:
        for line in f:
            line_str = line.rstrip('\r\n')
            if ': ' in line_str:
                prefix, content = line_str.split(': ', 1)
                prefix = prefix.strip()
                if prefix.isdigit():
                    result[int(prefix)] = content
    return result

lines = {}
for s in [27, 29, 31, 77, 135]:
    step_lines = extract_lines(f'c:/hipk/scratch/view_step_{s}.txt')
    lines.update(step_lines)

code_lines = [lines[i] for i in range(1, 451)]

trailing = [
    '                </View>',
    '                <Text style={[G.iconLabel, dynamic.iconLabel] as any}>Forgot</Text>',
    '              </TouchableOpacity>',
    '',
    '              <TouchableOpacity style={G.actionBtn as any} onPress={() => router.push(\'/Signup\')}>',
    '                <View style={[G.iconCircleAuth, dynamic.iconCircle] as any}>',
    '                  <Ionicons name="person-add-outline" size={20} color={COLORS.success} />',
    '                </View>',
    '                <Text style={[G.iconLabel, dynamic.iconLabel] as any}>New User</Text>',
    '              </TouchableOpacity>',
    '',
    '              <TouchableOpacity style={G.actionBtn as any} onPress={() => BackHandler.exitApp()}>',
    '                <View style={[G.iconCircleAuth, dynamic.iconCircle] as any}>',
    '                  <Ionicons name="exit-outline" size={20} color={COLORS.danger} />',
    '                </View>',
    '                <Text style={[G.iconLabel, { color: COLORS.danger }] as any}>Exit</Text>',
    '              </TouchableOpacity>',
    '            </View>',
    '          </View>',
    '        </ScrollView>',
    '      </KeyboardAvoidingView>',
    '    </SafeAreaView>',
    '  );',
    '};',
    '',
    'export default LoginScreen;',
    ''
]

full_lines = code_lines + trailing

# Apply step 148, 150, 154, 166 improvements
full_content = '\n'.join(full_lines)

# Step 148: adding checkingRegistration state
full_content = full_content.replace(
    '  const [isGuest, setIsGuest] = useState<boolean | null>(null);\n  const [showHostPicker, setShowHostPicker] = useState(false);',
    '  const [isGuest, setIsGuest] = useState<boolean | null>(null);\n  const [checkingRegistration, setCheckingRegistration] = useState(false);\n  const [showHostPicker, setShowHostPicker] = useState(false);'
)

# Step 150: checkRegistration with clean mobile and checkingRegistration
old_check = '''  const checkRegistration = async (val: string) => {
    const clean = val.replace(/\\D/g, '').slice(-10);
    if (clean.length === 10) {
      try {
        const res = await appService.httpClient.post('/auth/check-unique', { userMobile: clean });
        setIsGuest(!res.data?.exists);
      } catch (e) {
        setIsGuest(null);
      }
    } else {
      setIsGuest(null);
    }
  };'''

new_check = '''  const checkRegistration = async (val: string) => {
    const clean = val.replace(/\\D/g, '').slice(-10);
    if (clean.length === 10) {
      setCheckingRegistration(true);
      try {
        const res = await appService.httpClient.post('/auth/check-unique', { userMobile: clean });
        setIsGuest(res.data?.exists === false);
      } catch (e) {
        setIsGuest(false);
      } finally {
        setCheckingRegistration(false);
      }
    } else {
      setIsGuest(null);
      setCheckingRegistration(false);
    }
  };'''
full_content = full_content.replace(old_check, new_check)

# Step 154 & 166: mobile found feedback and password field
old_mobile_ui = '''              {isGuest && (
                <Text
                  style={{
                    fontSize: 11,
                    color: COLORS.accent,
                    fontWeight: '800',
                    marginTop: 4,
                    marginLeft: 4,
                  }}
                >
                  ✨ GUEST USER DETECTED
                </Text>
              )}
            </View>'''

new_mobile_ui = '''              {checkingRegistration ? (
                <Text
                  style={{
                    fontSize: 11,
                    color: COLORS.textMuted,
                    fontWeight: '600',
                    marginTop: 4,
                    marginLeft: 4,
                  }}
                >
                  Checking mobile number…
                </Text>
              ) : isGuest === true ? (
                <Text
                  style={{
                    fontSize: 11,
                    color: COLORS.accent,
                    fontWeight: '800',
                    marginTop: 4,
                    marginLeft: 4,
                  }}
                >
                  ✨ Unregistered User — Enter Reference Mobile
                </Text>
              ) : isGuest === false ? (
                <Text
                  style={{
                    fontSize: 11,
                    color: COLORS.success,
                    fontWeight: '700',
                    marginTop: 4,
                    marginLeft: 4,
                  }}
                >
                  ✓ Registered User — Enter your password
                </Text>
              ) : null}
            </View>'''
full_content = full_content.replace(old_mobile_ui, new_mobile_ui)

# Display host only live and active
old_hosts = '''  // Use centralized host list that respects isLocalMachine
  const buildHostList = () => {
    return appService.getHostList();
  };'''

new_hosts = '''  // Show live and active hosts in dropdown
  const displayHosts = React.useMemo(() => {
    const live = appService.getLiveURLs();
    if (live.length > 0) {
      const set = new Set<string>(live);
      if (customHost && !appService.isLocal(customHost)) set.add(customHost);
      return Array.from(set);
    }
    const active = customHost || appService.getCurrentBaseURL();
    return active ? [active] : (hostList.length > 0 ? [hostList[0]] : []);
  }, [hostList, customHost, hostStatus]);

  // Use centralized host list that respects isLocalMachine
  const buildHostList = () => {
    return appService.getHostList();
  };'''
full_content = full_content.replace(old_hosts, new_hosts)

# Make host list in dropdown use displayHosts or hostList
full_content = full_content.replace(
    '{hostList.map((url, i) => {',
    '{displayHosts.map((url, i) => {'
)

# And make sure require('../assets/icon.png') uses @/assets/icon.png or require('../assets/icon.png') safely
with open('c:/hipk/scratch/reconstructed_Signin.tsx', 'w', encoding='utf-8') as out:
    out.write(full_content)

print('Success! Total lines:', len(full_content.splitlines()))
