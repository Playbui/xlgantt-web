'use client';

/* DEMO ONLY, DO NOT USE IN PRODUCTION */

import * as React from 'react';

import { CopilotPlugin } from '@platejs/ai/react';
import {
  ExternalLinkIcon,
  Eye,
  EyeOff,
  Settings,
  Wand2Icon,
} from 'lucide-react';
import { useEditorRef } from 'platejs/react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

import { aiChatPlugin } from './ai-kit';

const DEFAULT_NVIDIA_MODEL = 'qwen/qwen3.5-397b-a17b';

function normalizeNvidiaModel(model: string) {
  const trimmed = model.trim();

  return /^(nvidia|qwen|meta|mistral|mistralai|deepseek)\//.test(trimmed)
    ? trimmed
    : DEFAULT_NVIDIA_MODEL;
}

export function SettingsDialog() {
  const editor = useEditorRef();

  const [tempNvidiaModel, setTempNvidiaModel] = React.useState(
    DEFAULT_NVIDIA_MODEL
  );
  const [tempKeys, setTempKeys] = React.useState<Record<string, string>>({
    aiGatewayApiKey: '',
    nvidiaApiKey: '',
    uploadthing: '',
  });
  const [showKey, setShowKey] = React.useState<Record<string, boolean>>({});
  const [open, setOpen] = React.useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Update AI chat options
    const chatOptions = editor.getOptions(aiChatPlugin).chatOptions ?? {};
    const nvidiaModel = normalizeNvidiaModel(tempNvidiaModel);

    editor.setOption(aiChatPlugin, 'chatOptions', {
      ...chatOptions,
      body: {
        ...chatOptions.body,
        apiKey: '',
        model: nvidiaModel,
        nvidiaApiKey: tempKeys.nvidiaApiKey,
        provider: 'nvidia',
      },
    });

    setOpen(false);

    // Update AI complete options
    const completeOptions =
      editor.getOptions(CopilotPlugin).completeOptions ?? {};
    editor.setOption(CopilotPlugin, 'completeOptions', {
      ...completeOptions,
      body: {
        ...completeOptions.body,
        apiKey: '',
        model: nvidiaModel,
        nvidiaApiKey: tempKeys.nvidiaApiKey,
        provider: 'nvidia',
      },
    });

    setTempNvidiaModel(nvidiaModel);
  };

  const toggleKeyVisibility = (key: string) => {
    setShowKey((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const renderApiKeyInput = (service: string, label: string) => (
    <div className="group relative">
      <div className="flex items-center justify-between">
        <label
          className="-translate-y-1/2 absolute top-1/2 block cursor-text px-1 text-muted-foreground/70 text-sm transition-all group-focus-within:pointer-events-none group-focus-within:top-0 group-focus-within:cursor-default group-focus-within:font-medium group-focus-within:text-foreground group-focus-within:text-xs has-[+input:not(:placeholder-shown)]:pointer-events-none has-[+input:not(:placeholder-shown)]:top-0 has-[+input:not(:placeholder-shown)]:cursor-default has-[+input:not(:placeholder-shown)]:font-medium has-[+input:not(:placeholder-shown)]:text-foreground has-[+input:not(:placeholder-shown)]:text-xs"
          htmlFor={label}
        >
          <span className="inline-flex bg-background px-2">{label}</span>
        </label>
        <Button size="icon" variant="ghost" className="absolute top-0 right-[28px] h-full" render={<a className="flex items-center" href={
                            service === 'aiGatewayApiKey'
                              ? 'https://vercel.com/docs/ai-gateway'
                              : service === 'nvidiaApiKey'
                                ? 'https://build.nvidia.com/'
                              : 'https://uploadthing.com/dashboard'
                          } rel="noopener noreferrer" target="_blank" />} nativeButton={false}><ExternalLinkIcon className="size-4" /><span className="sr-only">Get {label}</span></Button>
      </div>

      <Input
        id={label}
        className="pr-10"
        value={tempKeys[service]}
        onChange={(e) =>
          setTempKeys((prev) => ({ ...prev, [service]: e.target.value }))
        }
        placeholder=""
        data-1p-ignore
        type={showKey[service] ? 'text' : 'password'}
      />
      <Button
        size="icon"
        variant="ghost"
        className="absolute top-0 right-0 h-full"
        onClick={() => toggleKeyVisibility(service)}
        type="button"
      >
        {showKey[service] ? (
          <EyeOff className="size-4" />
        ) : (
          <Eye className="size-4" />
        )}
        <span className="sr-only">
          {showKey[service] ? 'Hide' : 'Show'} {label}
        </span>
      </Button>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="icon" variant="default" className={cn(
                      'group fixed right-4 bottom-4 z-50 size-10 overflow-hidden',
                      'rounded-full shadow-md hover:shadow-lg'
                    )} />}><Settings className="size-4" /></DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="text-xl">Settings</DialogTitle>
          <DialogDescription>
            Configure your API keys and preferences.
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-10" onSubmit={handleSubmit}>
          {/* AI Settings Group */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="size-8 rounded-full bg-purple-100 p-2 dark:bg-purple-900">
                <Wand2Icon className="size-4 text-purple-600 dark:text-purple-400" />
              </div>
              <h4 className="font-semibold">AI</h4>
            </div>

            <div className="space-y-4">
              <div className="rounded-2xl border border-border bg-muted/30 px-3 py-2 text-sm">
                NVIDIA NIM
              </div>

              {renderApiKeyInput('nvidiaApiKey', 'NVIDIA NIM API Key')}
              <div className="group relative">
                <label
                  className="-translate-y-1/2 absolute start-1 top-0 z-10 block bg-background px-2 font-medium text-foreground text-xs group-has-disabled:opacity-50"
                  htmlFor="nvidia-model"
                >
                  NVIDIA NIM Model
                </label>
                <Input
                  id="nvidia-model"
                  value={tempNvidiaModel}
                  onChange={(e) => setTempNvidiaModel(e.target.value)}
                  placeholder="qwen/qwen3.5-397b-a17b"
                />
                <p className="mt-1.5 text-muted-foreground text-xs">
                  build.nvidia.com의 모델 id를 그대로 입력하세요.
                </p>
              </div>
            </div>
          </div>

          {/* Upload Settings Group */}
          {/* <div className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="size-8 rounded-full bg-red-100 p-2 dark:bg-red-900">
                <Upload className="size-4 text-red-600 dark:text-red-400" />
              </div>
              <h4 className="font-semibold">Upload</h4>
            </div>

            <div className="space-y-4">
              {renderApiKeyInput('uploadthing', 'Uploadthing API key')}
            </div>
          </div> */}

          <Button size="lg" className="w-full" type="submit">
            Save changes
          </Button>
        </form>

        <p className="text-muted-foreground text-sm">
          Not stored anywhere. Used only for current session requests.
        </p>
      </DialogContent>
    </Dialog>
  );
}
