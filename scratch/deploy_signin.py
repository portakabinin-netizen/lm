with open('c:/hipk/scratch/reconstructed_Signin.tsx', 'r', encoding='utf-8') as src:
    content = src.read()

with open('c:/hipk/app/Signin.tsx', 'w', encoding='utf-8') as dst:
    dst.write(content)

print('Updated c:/hipk/app/Signin.tsx')

# For app/myscript/Signin.tsx, adjust image path
myscript_content = content.replace("require('../assets/icon.png')", "require('../../assets/icon.png')")
myscript_content = myscript_content.replace("router.push('/Signup')", "router.push('/myscript/Signup')")
myscript_content = myscript_content.replace("router.push('/resetPassword')", "router.push('/resetPassword')")

with open('c:/hipk/app/myscript/Signin.tsx', 'w', encoding='utf-8') as dst:
    dst.write(myscript_content)

print('Updated c:/hipk/app/myscript/Signin.tsx')
