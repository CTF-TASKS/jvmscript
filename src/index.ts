import { compile } from './compiler'
import { Socket, createServer } from './socket'
import { checkPow } from './pow'
import { Stream } from 'stream'
import { pack } from 'tar-stream'
import { configure as logConfigure, getLogger } from 'log4js'
import { join } from 'path'
import pLimit from 'p-limit'
import Docker from 'dockerode'

const Rolling = { maxLogSize: 10 * 1024 * 1024, backups: 1000, compress: true }
const LogPath = process.env.LOG_PATH || './log/'
logConfigure({
  appenders: {
    access: { type: 'file', filename: join(LogPath, 'access.log'), ...Rolling },
    error: { type: 'file', filename: join(LogPath, 'error.log'), ...Rolling },
    io: { type: 'file', filename: join(LogPath, 'io.log'), ...Rolling },
    console: { type: 'console' },
  },
  categories: {
    default: { appenders: ['access', 'console'], level: 'debug' },
    server: { appenders: ['access'], level: 'debug' },
    io: { appenders: ['io'], level: 'debug' },
    error: { appenders: ['error'], level: 'debug' },
  }
})

const Timeout = 5 * 1000 // 1s
const CodeLocation = '/data'
const DockerTag = 'openjdk:8-alpine'
const limit = pLimit(5)
const docker = new Docker()
const logger = getLogger('server')
const errorLogger = getLogger('error')
const ioLogger = getLogger('io')

function getStream(stream: Stream) {
  return new Promise<string>((resolve, reject) => {
    let out: Buffer[] = []
    const end = () => resolve(Buffer.concat(out).toString())
    stream.on('data', buf => out.push(buf))
    stream.on('end', end)
    stream.on('error', err => reject(err))
  })
}

function startContainerWithTimeout(container: Docker.Container) {
  return new Promise<string>(async (resolve, reject) => {
    let stop = false
    setTimeout(() => {
      stop = true
      reject(new Error('Timeout'))
      container.kill().catch(e => void 0)
    }, Timeout)
    try {
      const stream = await container.attach({
        stream: true,
        stdout: true,
        stderr: true,
        tty: true,
      })
      await container.start()
      if (stop) return
      await container.wait()
      resolve(getStream(stream))
      if (stop) return
    } catch(e) {
      reject(e)
    }
  })
}

async function onConnection(socket: Socket) {
  await socket.writeline(`Welcome to c0 online demo!`)
  await socket.writeline(`Zero-featured TypeScript on JVM\n`)
  await socket.writeline(`You can input your code and see the result!`)
  await socket.writeline(`For example:
print('hello world')
`)
  await socket.writeline(`Code(end with empty line):`)
  const code = []
  for (let i = 0; i < 50; i++) {
    const line = await socket.readline()
    if (line === '') break
    code.push(line)
  }
  const codeStr = code.join('\n')
  ioLogger.info(`${socket.endpoint} [code] ${codeStr}`)

  let out = Buffer.alloc(8192)
  const cls = compile(codeStr)
  const size = cls.write(out)
  out = out.slice(0, size)
  await socket.writeline(`Compile complete, size: ${out.byteLength}`)

  if (limit.pendingCount > 0) {
    await socket.writeline('Queuing...')
  }
  await limit(async () => {
    const tar = pack()
    tar.entry({ name: 'Main.class' }, out)
    tar.finalize()

    await socket.writeline('Running...')
    const c = await docker.createContainer({
      Image: DockerTag,
      Cmd: ['java', 'Main', '-Xms32m', 'Xmx64m'],
      Env: [`FLAG=${process.env.FLAG}`],
      WorkingDir: CodeLocation,
      Tty: true,
      HostConfig: {
        AutoRemove: true
      },
    })
    await c.putArchive(tar, { path: CodeLocation })
    const start = Date.now()
    const result = await startContainerWithTimeout(c)
    ioLogger.info(`${socket.endpoint} [result] (${Date.now() - start}ms) ${result}`)
    await socket.writeline('Result:')
    await socket.writeline(result)
  })
  await socket.writeline('Bye!')
}

function loggerLayer(cb: (socket: Socket) => Promise<void>) {
  return async (socket: Socket) => {
    const start = Date.now()
    try {
      await cb(socket)
    } finally {
      logger.info(`${socket.endpoint} disconnected ${Date.now() - start}ms`)
    }
  }
}

function asyncWrapper(cb: (socket: Socket) => Promise<void>) {
  return async (socket: Socket) => {
    socket.s.on('error', err => {
      errorLogger.error(`${socket.endpoint}`, err)
    })
    try {
      await cb(socket)
    } catch (e) {
      errorLogger.error(socket.endpoint, e)
      await socket.writeline(`Error: ${e.message}`)
        .catch(e => errorLogger.error(e))
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
    asyncWrapper(checkPow(loggerLayer(onConnection)))
  )
  const host = process.env.HOST ?? '127.0.0.1'
  const port = process.env.PORT ?? '5000'
  server.listen(parseInt(port), host)
  console.log(`Server ready at ${host}:${port}`)
}

main().catch(e => console.error(e))
