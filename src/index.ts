import { compile } from './compiler'
import { writeFileSync } from 'fs'

const cls = compile(`
  let test = '2'
  let a = '1'
  print('hello world')
`)
let out = Buffer.alloc(8192)
const size = cls.write(out)
out = out.slice(0, size)

console.log('Compile complete, size:', out.byteLength)
writeFileSync('Main.class', out)
