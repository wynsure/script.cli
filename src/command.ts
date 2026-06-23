import Path from "path"
import Process from "process"
import ChildProcess from "child_process"

export type StringMap = { [name: string]: string }
export type StringArray = string[]

export type CommandOptionsType = {
  cwd?: string
  env?: { [name: string]: string }
  ignoreStatus?: boolean
}

export type ReadCommandOptionsType = CommandOptionsType & {
  maxBuffer?: number
}

const stdout_size_max = 128 * 1024 * 1024 // 128 MiB

type RunResult = {
  status: number
  stdout: string
  stderr: string
  error?: Error
}

function resolveOptions(options?: CommandOptionsType | ReadCommandOptionsType) {
  return {
    ...options,
    cwd: options?.cwd ? Path.resolve(options.cwd) : undefined,
  }
}

function runExec(
  command: string,
  options: CommandOptionsType | ReadCommandOptionsType | undefined,
  captureOutput: boolean,
): RunResult {
  try {
    const stdout = ChildProcess.execSync(command, {
      ...resolveOptions(options),
      stdio: captureOutput
        ? "pipe"
        : ["inherit", "inherit", "inherit"],
      maxBuffer: captureOutput
        ? (options as ReadCommandOptionsType)?.maxBuffer ?? stdout_size_max
        : undefined,
    })

    return {
      status: 0,
      stdout: stdout?.toString() ?? "",
      stderr: "",
    }
  }
  catch (error: any) {
    return {
      status:
        typeof error?.status === "number"
          ? error.status
          : 1,
      stdout: error?.stdout?.toString?.() ?? "",
      stderr: error?.stderr?.toString?.() ?? "",
      error,
    }
  }
}

function runSpawn(
  program: string,
  args: string[],
  options: CommandOptionsType | ReadCommandOptionsType | undefined,
  captureOutput: boolean,
): RunResult {
  const result = ChildProcess.spawnSync(program, args, {
    ...resolveOptions(options),
    stdio: captureOutput
      ? "pipe"
      : ["inherit", "inherit", "inherit"],
    maxBuffer: captureOutput
      ? (options as ReadCommandOptionsType)?.maxBuffer ?? stdout_size_max
      : undefined,
  })

  return {
    status:
      result.status ??
      (result.error ? 1 : 0),

    stdout: result.stdout?.toString() ?? "",
    stderr: result.stderr?.toString() ?? "",
    error: result.error ?? undefined,
  }
}

function handleFailure(
  command: string,
  result: RunResult,
  options?: CommandOptionsType,
): void {
  let message: string

  if (result.error) {
    message =
      `Command '${command}' has crashed:\n` +
      indentMessage(result.error)
  }
  else {
    message =
      `Command '${command}' has failed with status code ${result.status}.`
  }

  if (options?.ignoreStatus) {
    console.log("[ignored]", message)
    return
  }

  throw new Error(message)
}

function indentMessage(message: any): string {
  const padding = "    | "
  return (
    padding +
    message.toString().split("\n").join("\n" + padding)
  )
}

type ReadCommand = {
  exec(
    command: string,
    options?: ReadCommandOptionsType
  ): string

  call(
    program: string,
    args?: string[],
    options?: ReadCommandOptionsType
  ): string
}

export const command: {
  exec(
    command: string,
    options?: CommandOptionsType
  ): number

  call(
    program: string,
    args?: (string | StringMap | StringArray)[],
    options?: CommandOptionsType
  ): number

  exit(status: number): void

  read: ReadCommand
} = {
  read: {
    exec(command, options) {
      const result = runExec(
        command,
        options,
        true,
      )

      if (result.status !== 0 || result.error) {
        handleFailure(command, result, options)
      }

      return result.stdout
    },

    call(program, args, options) {
      const argv = normalizeArgs(args)

      const result = runSpawn(
        program,
        argv,
        options,
        true,
      )

      if (result.status !== 0 || result.error) {
        handleFailure(
          `${program} ${argv.join(" ")}`,
          result,
          options,
        )
      }

      return result.stdout
    },
  },

  exec(command, options) {
    const result = runExec(
      command,
      options,
      false,
    )

    if (result.status !== 0 || result.error) {
      handleFailure(command, result, options)
    }

    return 0
  },

  call(program, args, options) {
    const argv = normalizeArgs(args)

    const result = runSpawn(
      program,
      argv,
      options,
      false,
    )

    if (result.status !== 0 || result.error) {
      handleFailure(
        `${program} ${argv.join(" ")}`,
        result,
        options,
      )
    }

    return result.status  // Non-zero statuses are either thrown or ignored.
  },

  exit(status) {
    Process.exit(status)
  },
}

function normalizeArgs(argv): string[] {
  const result: string[] = []

  function process(arg: any): void {
    if (Array.isArray(arg)) {
      arg.forEach(process)
    }
    else if (typeof arg === "object" && arg !== null) {
      for (const key in arg) {
        result.push(key)
        process(arg[key])
      }
    }
    else if (arg !== undefined) {
      result.push(arg.toString())
    }
  }

  process(argv)

  return result
}
