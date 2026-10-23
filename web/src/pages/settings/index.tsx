import { App, Button } from "antd";
import { ArrowLeft, HardDrive, Bug, Clapperboard, RadioTower } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate, useSearchParams } from "react-router";

import { useConfigStore, useEffectiveConfig } from "@/stores/use-config-store";
import { useUserStore } from "@/stores/use-user-store";
import { ChannelSettingsPane, channelValidationError, focusInvalidChannelField, isChannelReady } from "./channel-settings-pane";
import { LocalGenerationDefaultsPane } from "./local-generation-defaults-pane";
import { ModelDefaultGrid } from "./model-default-grid";
import DiagnosticsPanel from "./diagnostics-panel";
import { StorageSettingsPane } from "./storage-settings-pane";
import { DepthComponentsPanel } from "@/components/depth-components-panel";
import { ReferenceStoragePane } from "./reference-storage-pane";
import { getDesktopAppBinding } from "@/services/desktop-runtime";
import { PageHeader } from "@/components/layout/workspace-page";

import { workspaceCapabilities } from "@/services/workspace-mode";
import { cn } from "@/lib/utils";

type ConfigSectionKey = "channels" | "local-gen" | "storage" | "diagnostics";

const configSections: Array<{ key: ConfigSectionKey; label: string; description: string; icon: ReactNode; localOnly?: boolean }> = [
    { key: "channels", label: "个人渠道", description: "API 渠道与默认云端模型", icon: <RadioTower className="size-4" /> },
    { key: "local-gen", label: "本机生成", description: "ComfyUI 工作流默认能力", icon: <Clapperboard className="size-4" />, localOnly: true },
    { key: "storage", label: "存储设置", description: "本地目录与参考素材存储", icon: <HardDrive className="size-4" /> },
    { key: "diagnostics", label: "问题诊断", description: "导出问题记录", icon: <Bug className="size-4" /> },
];

export function isConfigSection(value: string | null): value is ConfigSectionKey {
    return value === "channels" || value === "local-gen" || value === "storage" || value === "diagnostics";
}

export default function SettingsPage() {
    const { message } = App.useApp();
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const requestedSection = searchParams.get("section");
    const customChannelsEnabled = useUserStore((state) => state.features.customChannelsEnabled);
    const localMode = workspaceCapabilities().local;
    const nativeStorage = Boolean(getDesktopAppBinding()?.StorageSettings);
    const visibleConfigSections = useMemo(
        () => configSections.filter((section) => {
            if (section.localOnly && !localMode) return false;
            if (section.key === "storage" && !nativeStorage) return false;
            if (section.key === "channels" && !customChannelsEnabled) return false;
            return true;
        }),
        [customChannelsEnabled, localMode, nativeStorage],
    );
    const initialSection = isConfigSection(requestedSection) ? requestedSection : (visibleConfigSections[0]?.key || "channels");
    const [activeTab, setActiveTab] = useState<ConfigSectionKey>(initialSection);
    const config = useConfigStore((state) => state.config);
    const effectiveConfig = useEffectiveConfig();
    const updateConfig = useConfigStore((state) => state.updateConfig);
    const shouldPromptContinue = searchParams.get("continue") === "1";
    const userChannels = config.channels.filter((channel) => channel.scope !== "system");

    const isVisibleConfigSection = (value: string | null): value is ConfigSectionKey => isConfigSection(value) && visibleConfigSections.some((section) => section.key === value);

    useLayoutEffect(() => {
        document.body.classList.add("app-user-overlays");
        return () => document.body.classList.remove("app-user-overlays");
    }, []);

    useEffect(() => {
        if (isVisibleConfigSection(requestedSection)) {
            setActiveTab(requestedSection);
            return;
        }
        setActiveTab((current) => visibleConfigSections.some((section) => section.key === current) ? current : (visibleConfigSections[0]?.key || "channels"));
    }, [customChannelsEnabled, localMode, requestedSection, visibleConfigSections]);

    const selectSection = (section: ConfigSectionKey) => {
        setActiveTab(section);
        const next = new URLSearchParams(searchParams);
        next.set("section", section);
        setSearchParams(next, { replace: true });
    };

    const finishConfig = () => {
        const invalidChannel = customChannelsEnabled ? userChannels.find((channel) => channelValidationError(channel)) : undefined;
        if (invalidChannel) {
            selectSection("channels");
            message.warning(`${invalidChannel.name || "未命名渠道"}：${channelValidationError(invalidChannel)}`);
            focusInvalidChannelField(invalidChannel);
            return;
        }
        if (!effectiveConfig.channels.some(isChannelReady)) {
            selectSection("channels");
            message.error(customChannelsEnabled ? (shouldPromptContinue ? "请先完成至少一个渠道的 Base URL、API Key 和模型配置" : "当前没有可用渠道，请先完成连接信息和模型配置") : "当前没有可用的系统模型，请联系管理员配置系统渠道");
            return;
        }
        message.success("配置已保存，正在返回创作页面");
        navigate(-1);
    };

    const panes: Record<Exclude<ConfigSectionKey, "diagnostics">, ReactNode> = {
        channels: (
            <SettingsPane>
                <ChannelSettingsPane onOpenDiagnostics={() => selectSection("diagnostics")} />
                <div className="settings-section model-default-section">
                    <div className="settings-pane-header">
                        <div className="min-w-0">
                            <h2>云端默认模型</h2>
                            <p className="mt-1 text-xs text-foreground/55">渠道 API 模型默认值。本机 ComfyUI 工作流请到「本机生成」页配置。</p>
                        </div>
                    </div>
                    <ModelDefaultGrid config={effectiveConfig} onChange={(key, model) => updateConfig(key, model)} />
                </div>
            </SettingsPane>
        ),
        storage: (
            <SettingsPane>
                <PageHeader title="存储设置" />
                <div className="storage-settings-sections">
                    <StorageSettingsPane />
                    <ReferenceStoragePane />
                    <section className="settings-section storage-settings-block space-y-4" aria-label="深度捕捉组件">
                        <div className="settings-pane-header"><h2>深度捕捉组件</h2></div>
                        <DepthComponentsPanel />
                    </section>
                </div>
            </SettingsPane>
        ),
        "local-gen": (
            <SettingsPane>
                <LocalGenerationDefaultsPane />
            </SettingsPane>
        ),
    };

    return (
        <main className="settings-page app-workspace-page app-user-workspace app-section-page flex h-full min-h-0 flex-col text-foreground">
                {shouldPromptContinue ? <div className="settings-topbar shrink-0">
                    <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
                        {shouldPromptContinue ? <>
                        <Button icon={<ArrowLeft className="size-4" />} onClick={() => navigate(-1)}>返回创作</Button>
                        <Button type="primary" onClick={finishConfig}>保存并返回</Button>
                        </> : null}
                    </div>
                </div> : null}
            <div className="settings-library-frame flex min-h-0 flex-1 flex-col md:flex-row">
                {visibleConfigSections.length > 1 ? (
                    <aside className="settings-sidebar shrink-0 border-b border-border/50 px-3 py-3 md:w-52 md:border-b-0 md:border-r md:py-5">
                        <nav className="flex gap-1 overflow-x-auto md:flex-col" aria-label="设置分区">
                            {visibleConfigSections.map((section) => {
                                const active = activeTab === section.key;
                                return (
                                    <button
                                        key={section.key}
                                        type="button"
                                        className={cn(
                                            "flex min-w-[9.5rem] items-start gap-2 rounded-md px-2.5 py-2 text-left transition-colors md:min-w-0",
                                            active ? "bg-surface-active text-foreground" : "text-foreground/65 hover:bg-surface-active/60 hover:text-foreground",
                                        )}
                                        aria-current={active ? "page" : undefined}
                                        onClick={() => selectSection(section.key)}
                                    >
                                        <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-md bg-foreground/[.06]">{section.icon}</span>
                                        <span className="min-w-0">
                                            <span className="block text-xs font-semibold">{section.label}</span>
                                            <span className="mt-0.5 block text-[var(--fs-tiny)] text-foreground/45">{section.description}</span>
                                        </span>
                                    </button>
                                );
                            })}
                        </nav>
                    </aside>
                ) : null}
                <section className="settings-content flex min-h-0 min-w-0 flex-1 flex-col">
                    <div className="app-workspace-scroll app-section-page-content min-h-0 flex-1 overflow-y-auto overscroll-contain">
                        <div className="settings-pane-root mx-auto w-full max-w-none">
                            {panes[activeTab === "diagnostics" ? "channels" : activeTab]}
                        </div>
                    </div>
                </section>
            </div>
            <DiagnosticsPanel
                open={activeTab === "diagnostics"}
                onClose={() => selectSection("channels")}
                taskId={searchParams.get("taskId") || undefined}
                projectId={searchParams.get("projectId") || undefined}
            />
        </main>
    );
}

function SettingsPane({ children, fill = false }: { children: ReactNode; fill?: boolean }) {
    return <div className={fill ? "settings-pane h-full" : "settings-pane"}>{children}</div>;
}
