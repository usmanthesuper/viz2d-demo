'use client'

import { useEffect, useState } from "react"
import VisualizerMain from "./visualizer-main"
import { Button } from "@/components/ui/button"
import { ArrowUpRight, HelpCircle, Loader, Loader2, Upload } from "lucide-react"
import { Suspense } from "react"
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

type FileState = {
  loading: boolean
  progress: number
  file?: File
}

export const config = {
    companyLogo: '/assets/logo.png',
    websiteUrl: 'https://viz2d.com',
    name: 'Viz2D',
    sampleFiles: [
        {
            name: 'Living Room 1',
            image: '/assets/samples/1.jpg',
            viz2dFile: '/assets/samples/1.viz2d'
        },
        {
            name: 'Living Room 2',
            image: '/assets/samples/2.jpg',
            viz2dFile: '/assets/samples/2.viz2d'
        },
        {
            name: 'Bed Room',
            image: '/assets/samples/3.jpg',
            viz2dFile: '/assets/samples/3.viz2d'
        },
        {
            name: 'Bathoom',
            image: '/assets/samples/4.jpg',
            viz2dFile: '/assets/samples/4.viz2d'
        },
        {
            name: 'Kitchen',
            image: '/assets/samples/5.jpg',
            viz2dFile: '/assets/samples/5.viz2d'
        },
        {
            name: 'Garage',
            image: '/assets/samples/6.jpg',
            viz2dFile: '/assets/samples/6.viz2d'
        },
        {
            name: 'Terasse',
            image: '/assets/samples/7.jpg',
            viz2dFile: '/assets/samples/7.viz2d'
        },
        {
            name: 'Stairs',
            image: '/assets/samples/8.jpg',
            viz2dFile: '/assets/samples/8.viz2d'
        },
        {
            name: 'Balcony',
            image: '/assets/samples/9.jpg',
            viz2dFile: '/assets/samples/9.viz2d'
        },
        
    ],
    textureKeywords: ['wall','floor'],
    textures: [
        {
            image: '/assets/samples/textures/1.jpg',
            scale: 1,
            keywords: ['wall','floor']
        },
        {
            image: '/assets/samples/textures/2.jpg',
            scale: 1,
            keywords: ['wall']
        }
    ],
    useCredits: false,
    allowScaling:true,
    allowUploadingTextures: true,
}

export type VisualizerType = typeof config

export default function VisualizerComponent() {
  return (
    <Suspense fallback={<div className="flex flex-col items-center my-10 gap-2"><Loader className="animate-spin" />Loading Visualizer...</div>}>
      <Main config={config} />
    </Suspense>
  )
}

function Main({ config }: { config: VisualizerType }) {
  const [fileState, setFileState] = useState<FileState>({
    loading: false,
    progress: 0,
  })

  const [searchParams] = useSearchParams()
  const {pathname} = useLocation()
  const navigate = useNavigate()
  const fileUrl = searchParams.get("fileUrl")

  useEffect(() => {
    if (fileUrl) {
      loadFromUrl(fileUrl)
      navigate(pathname,{replace:true})
    }
  }, [fileUrl])

  async function loadFromUrl(url: string) {
    setFileState({ loading: true, progress: 0 })

    const response = await fetch(url)
    if (!response.body) throw new Error("Streaming not supported")

    const contentLength = Number(response.headers.get("Content-Length")) || 0
    const reader = response.body.getReader()

    let received = 0
    const chunks: Uint8Array<ArrayBuffer>[] = []

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      if (value) {
        chunks.push(value)
        received += value.length

        if (contentLength) {
          setFileState(prev => ({
            ...prev,
            progress: Math.round((received / contentLength) * 100),
          }))
        }
      }
    }

    const blob = new Blob(chunks, {
      type: "application/octet-stream",
    })

    const file = new File([blob], "visualizer.viz2d", {
      type: blob.type,
      lastModified: Date.now(),
    })

    setFileState({ loading: false, progress: 100, file })
  }

  return (
    <Suspense fallback={<Loader className="mx-auto my-10 animate-spin" />}>
      <>
        {fileState.loading && (
          <div className="fixed inset-0 z-50 bg-black/60 text-white flex flex-col items-center justify-center gap-4">
            <div className="flex items-center gap-2 text-xl">
              <Loader2 className="animate-spin" />
              Loading…
            </div>

            <div className="w-72 h-3 bg-white/20 rounded overflow-hidden">
              <div
                className="h-full bg-cyan-400 transition-all duration-200"
                style={{ width: `${fileState.progress}%` }}
              />
            </div>

            <div className="text-sm opacity-80">
              {fileState.progress}%
            </div>
          </div>
        )}

        {fileState.file ? (
          <VisualizerMain config={config} file={fileState.file} onClose={() => { setFileState({ loading: false, progress: 0 }) }} />
        ) : (
          <div className="flex flex-col items-center gap-5 my-12">
            <img src={config.companyLogo} className="mx-auto mb-5 h-14 max-w-40 object-contain" />

            <div className="flex gap-5 justify-center flex-wrap">
              <div className="flex gap-1">
                <Button asChild>
                  <label htmlFor="fileinput" className="cursor-pointer">
                    <input
                      type="file"
                      accept=".viz2d"
                      id="fileinput"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        if (file) {
                          setFileState({ loading: false, progress: 100, file })
                        }
                        e.target.value = ""
                      }}
                    />
                    <Upload />
                    Load Viz2d File
                  </label>
                </Button>
                <ConvertInfo />
              </div>
            </div>

            <div>OR</div>

            <div>
              <div className="font-semibold mb-4 text-xl text-center">
                Try our demo images
              </div>

              <div className="flex gap-5 flex-wrap justify-center">
                {config.sampleFiles.map((sample: any, index) => (
                  <Link
                    key={index}
                    to={pathname + '?fileUrl=' + sample.viz2dFile}
                    className="border p-1 w-80 rounded cursor-pointer hover:scale-105 duration-200"
                  >
                    <img
                      src={sample.image}
                      className="w-full aspect-video object-cover"
                    />
                    <div className="text-lg font-semibold mt-2 text-center">
                      {sample.name}
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        )}
      </>
    </Suspense>
  )
}

function ConvertInfo() {
  const [open, setOpen] = useState(false)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="How to convert files to Viz2D"
          className="text-muted-foreground hover:text-foreground transition-colors h-fit"
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={() => setOpen(false)}
          onFocus={() => setOpen(true)}   // keyboard
          onBlur={() => setOpen(false)}
        >
          <HelpCircle className="h-5 w-5" />
        </button>
      </PopoverTrigger>

      <PopoverContent
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        className="max-w-56 p-3 space-y-2"
      >
        <p className="text-sm">
          Don’t have a <strong>.viz2d</strong> file yet?
        </p>

        <Button className="bg-cyan-500 hover:bg-cyan-600 text-black" asChild>
          <a
            href="https://viz2d.com/convert"
            target="_blank"
            rel="noopener noreferrer"
          >
            Open converter <ArrowUpRight />
          </a>
        </Button>
      </PopoverContent>
    </Popover>
  )
}