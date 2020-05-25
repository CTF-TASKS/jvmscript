import { compile } from './compiler'
import { writeFileSync } from 'fs'
import { Socket, createServer } from './socket'
import { checkPow } from './pow'

async function onConnection(socket: Socket) {
  await socket.writeline(`Welcome to c0 online demo!`)
  await socket.writeline(`Zero-featured TypeScript on JVM\n`)
  await socket.writeline(`You can input your code and see the result!`)
  await socket.writeline(`Code(end with empty line):`)
  const code = []
  for (let i = 0; i < 50; i++) {
    const line = await socket.readline()
    if (line === '') break
    code.push(line)
  }

  let out = Buffer.alloc(8192)
  const cls = compile(code.join('\n'))
  const size = cls.write(out)
  out = out.slice(0, size)
  await socket.writeline(`Compile complete, size: ${out.byteLength}`)

  writeFileSync('Main.class', out)
}

async function main() {
  const server = createServer(checkPow(onConnection))
  const port = process.env.PORT ?? '5000'
  server.listen(parseInt(port), process.env.HOST ?? '127.0.0.1')
}

main().catch(e => console.error(e))
