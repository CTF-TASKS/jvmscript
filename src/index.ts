import { compile } from './compiler'
import { writeFileSync } from 'fs'

const cls = compile(`
  let a = 'hello '
  let b = 'world'
  let hw = a + b
  hw = a + b
  print(hw)
`)
let out = Buffer.alloc(8192)
const size = cls.write(out)
out = out.slice(0, size)

console.log('Compile complete, size:', out.byteLength)
writeFileSync('Main.class', out)
