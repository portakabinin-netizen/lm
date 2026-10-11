with open('c:/hipk/scratch/reconstructed_Signin.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

target = '''                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: 4,
                  }}
                >
                  <Text style={[G.label, dynamic.inputLabel, { marginBottom: 0 }] as any}>
                    {isGuest ? 'Reference Mobile' : 'Password'}
                  </Text>
                  {isGuest !== null && (
                    <TouchableOpacity
                      onPress={() => setIsGuest(!isGuest)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Text style={{ fontSize: 11, color: COLORS.primary, fontWeight: '700' }}>
                        {isGuest ? 'Enter Password instead' : 'Use Reference Mobile'}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>'''

replacement = '''                <Text style={[G.label, dynamic.inputLabel] as any}>
                  {isGuest ? 'Reference Mobile' : 'Password'}
                </Text>'''

content = content.replace(target, replacement)

content = content.replace(
    "placeholder={isGuest ? 'Enter Supervisor Mobile' : 'Password'}",
    "placeholder={isGuest ? 'Enter Reference Mobile' : 'Enter your password'}"
)

content = content.replace(
    "keyboardType={isGuest ? 'number-pad' : 'default'}",
    "keyboardType={isGuest ? 'phone-pad' : 'default'}"
)

content = content.replace(
    '''                  autoCapitalize="none"
                />''',
    '''                  autoCapitalize="none"
                  maxLength={isGuest ? 10 : undefined}
                />'''
)

with open('c:/hipk/scratch/reconstructed_Signin.tsx', 'w', encoding='utf-8') as f:
    f.write(content)

print('Updated reconstructed_Signin.tsx successfully')
