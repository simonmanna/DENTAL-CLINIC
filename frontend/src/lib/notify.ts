import { toast, type ExternalToast } from "sonner";

// Solid, top-center status banners: green = success, yellow = warning
// (user can fix it), red = error. The `!` overrides the neutral
// bg-background the shared <Toaster> applies to every toast.
const base = "!border-0 !shadow-lg [&_[data-description]]:!opacity-90";

const styles = {
  success: `${base} !bg-success !text-success-foreground [&_[data-description]]:!text-success-foreground`,
  warning: `${base} !bg-amber-400 !text-amber-950 [&_[data-description]]:!text-amber-950`,
  error: `${base} !bg-danger !text-danger-foreground [&_[data-description]]:!text-danger-foreground`,
  info: `${base} !bg-info !text-info-foreground [&_[data-description]]:!text-info-foreground`,
};

const DURATION = 4000;

type Opts = Omit<ExternalToast, "className">;

const show =
  (kind: keyof typeof styles, duration: number) =>
  (title: string, description?: string, opts: Opts = {}) =>
    toast[kind](title, {
      description,
      position: "top-center",
      duration,
      className: styles[kind],
      ...opts,
    });

export const notify = {
  success: show("success", DURATION),
  warning: show("warning", DURATION + 2000),
  error: show("error", DURATION + 2000),
  info: show("info", DURATION),
};
