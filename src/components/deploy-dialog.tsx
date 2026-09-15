import { ArrowRight, Terminal } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"

export function DeployDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button size="lg">
          Deploy FreeCoffee <ArrowRight data-icon="inline-end" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <div className="mb-2 flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Terminal className="size-5" />
          </div>
          <DialogTitle>Deploy your own Tipping Platform</DialogTitle>
          <DialogDescription>
            Run FreeCoffee on Cloudflare and keep control of your platform, audience, and payment accounts.
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-lg border bg-muted/50 p-4 font-mono text-sm">
          <span className="text-primary">$</span> git clone freecoffee.bio
          <br />
          <span className="text-primary">$</span> npm install
          <br />
          <span className="text-primary">$</span> npm run dev
        </div>
        <DialogFooter>
          <Button asChild>
            <a href="https://github.com/freecoffee-bio" target="_blank" rel="noreferrer">
              View on GitHub <ArrowRight data-icon="inline-end" />
            </a>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
