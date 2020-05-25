import { compile } from './compiler'
import { writeFile as writeFileAsync } from 'fs'
import { Socket, createServer } from './socket'
import { checkPow } from './pow'
import { withDir, DirectoryResult } from 'tmp-promise'
import { promisify } from 'util'
import { join } from 'path'
import { Stream } from 'stream'
import pLimit from 'p-limit'
import Docker from 'dockerode'

const CodeLocation = '/data'
const DockerTag = 'openjdk:8-alpine'
const limit = pLimit(5)
const docker = new Docker()
const writeFile = promisify(writeFileAsync)

function getStream(stream: Stream) {
  return new Promise<string>((resolve, reject) => {
    let out: Buffer[] = []
    const end = () => resolve(Buffer.concat(out).toString())
    stream.on('data', buf => out.push(buf))
    stream.on('end', end)
    stream.on('error', err => reject(err))
  })
}

async function onConnection(socket: Socket, dir: DirectoryResult) {
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

  await writeFile(join(dir.path, 'Main.class'), out)
  if (limit.pendingCount > 0) {
    await socket.writeline('Queuing...')
  }
  await limit(async () => {
    await socket.writeline('Running...')
    const c = await docker.createContainer({
      Image: DockerTag,
      Cmd: ['java', 'Main'],
      Env: [`FLAG=${process.env.FLAG}`],
      WorkingDir: CodeLocation,
      Volumes: {
        [CodeLocation]: {}
      },
      HostConfig: {
        Binds: [`${dir.path}:${CodeLocation}`],
        AutoRemove: true
      },
    })
    const stream = await c.attach({
      stream: true,
      stdout: true,
      stderr: true,
    })
    await c.start()
    await c.wait()
    await socket.writeline('Result:')
    await socket.writeline(await getStream(stream))
  })
  await socket.writeline('Bye!')
}

function withTmpDir(cb: (socket: Socket, dir: DirectoryResult) => Promise<void>) {
  return (socket: Socket) => withDir((dir) => cb(socket, dir), { unsafeCleanup: true })
}

function asyncWrapper(cb: (socket: Socket) => Promise<void>) {
  return async (socket: Socket) => {
    try {
      await cb(socket)
    } catch (e) {
      console.error(e)
      await socket.writeline(`Error: ${e.message}`)
    } finally {
      await socket.close()
    }
  }
}

async function main() {
  try {
    await docker.run(DockerTag, ['java', '-version'], process.stdout, {
      HostConfig: {
        AutoRemove: true
      }
    })
  } catch (e) {
    console.log('Pulling docker image')
    await docker.pull(DockerTag, {})
  }
  const server = createServer(
    asyncWrapper(checkPow(withTmpDir(onConnection)))
  )
  const host = process.env.HOST ?? '127.0.0.1'
  const port = process.env.PORT ?? '5000'
  server.listen(parseInt(port), host)
  console.log(`Server ready at ${host}:${port}`)
}

main().catch(e => console.error(e))
