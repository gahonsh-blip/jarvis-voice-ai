import React, { useState, useEffect } from 'react';
import {
  X,
  Cloud,
  Cpu,
  HardDrive,
  Activity,
  ShieldCheck,
  Terminal,
  RefreshCw,
  Copy,
  Check,
  Lock,
  Server,
  Zap,
} from 'lucide-react';
import { OracleVMStatus } from '../types';
import { billingBadgeLabel } from '../utils/hardening/billingEntitlementTruth';
import { processUptimeLabel } from '../utils/hardening/processUptimeTruth';
import {
  normalizeUptimeHours,
  normalizePublicIp,
  normalizeVmStatus,
  normalizeMetricPercent,
  normalizeGigabytes,
  buildSshCommand,
  resolveFirewallRuleState,
  summarizeFirewallObservation,
} from '../utils/vmTelemetryDisplay';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

/** Renders a value that was never reported as an explicit unknown. */
const UNKNOWN = 'UNKNOWN';

export const OracleCloudModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const [vmStatus, setVmStatus] = useState<OracleVMStatus | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [copied, setCopied] = useState<boolean>(false);

  useEffect(() => {
    if (isOpen) {
      fetchTelemetry();
      const interval = setInterval(fetchTelemetry, 4000);
      return () => clearInterval(interval);
    }
  }, [isOpen]);

  const fetchTelemetry = async () => {
    try {
      const res = await fetch('/api/oracle-cloud');
      const data = await res.json();
      setVmStatus(data);
    } catch (err) {
      console.warn('Failed to fetch Oracle VM status:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCopySSH = () => {
    // Copy only a command that targets an address the server actually reported.
    const command = buildSshCommand(vmStatus?.publicIp);
    if (!command) return;
    navigator.clipboard.writeText(command);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Every one of these is null when the payload did not carry a usable value.
  const publicIp = normalizePublicIp(vmStatus?.publicIp);
  const sshCommand = buildSshCommand(vmStatus?.publicIp);
  const uptimeHours = normalizeUptimeHours(vmStatus?.uptimeHours);
  const runState = normalizeVmStatus(vmStatus?.status);
  const cpuUsage = normalizeMetricPercent(vmStatus?.metrics?.cpuUsage);
  const ramUsedGb = normalizeGigabytes(vmStatus?.metrics?.ramUsedGb);
  const ramTotalGb = normalizeGigabytes(vmStatus?.metrics?.ramTotalGb);
  const diskUsage = normalizeMetricPercent(vmStatus?.metrics?.diskUsage);
  // The declared rules carry no observation until a probe actually reports one,
  // so this summary reads `verified: false` until then and the panel says so.
  const firewallSummary = summarizeFirewallObservation(vmStatus?.firewallRules);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in font-sans">
      <div className="bg-slate-900 border border-emerald-800/50 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/80">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-emerald-950 border border-emerald-500/30 text-emerald-400">
              <Cloud className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-slate-100">Oracle Cloud Always Free ARM Server</h2>
                <span
                  className="px-2 py-0.5 text-[11px] font-mono rounded bg-emerald-950 text-emerald-300 border border-emerald-800 font-bold"
                  title="Always Free is the declared plan; the billing/entitlement API is not queried, so this is not an observed charge state."
                >
                  {billingBadgeLabel(vmStatus?.billingEntitlement)}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Declared plan: {vmStatus?.shape ?? 'UNKNOWN'} (Ampere A1 ARM64) • {vmStatus?.ocpu ?? 'UNKNOWN'} OCPUs • {vmStatus?.ramGb ?? 'UNKNOWN'} GB RAM • {vmStatus?.bootVolumeGb ?? 'UNKNOWN'} GB Storage — not read from a running instance
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Live Status Content */}
        <div className="flex-1 p-6 overflow-y-auto flex flex-col gap-6 bg-slate-950/40">
          {/* Top Metric Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 flex flex-col gap-2">
              <div className="flex items-center justify-between text-xs font-mono text-slate-400">
                <span>CPU LOAD</span>
                <Cpu className="w-4 h-4 text-cyan-400" />
              </div>
              <div className="text-2xl font-mono font-bold text-slate-100">
                {cpuUsage != null ? `${cpuUsage}%` : '—'}
              </div>
              <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                <div
                  className="bg-cyan-400 h-full transition-all duration-300"
                  style={{ width: `${cpuUsage ?? 0}%` }}
                />
              </div>
            </div>

            <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 flex flex-col gap-2">
              <div className="flex items-center justify-between text-xs font-mono text-slate-400">
                <span>RAM USAGE</span>
                <Server className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="text-2xl font-mono font-bold text-slate-100">
                {ramUsedGb != null ? ramUsedGb : '—'}{' '}
                <span className="text-sm font-normal text-slate-400">
                  / {ramTotalGb ?? '?'} GB
                </span>
              </div>
              <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                <div
                  className="bg-emerald-400 h-full transition-all duration-300"
                  style={{ width: `${vmStatus?.metrics?.ramUsage ?? 0}%` }}
                />
              </div>
            </div>

            <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 flex flex-col gap-2">
              <div className="flex items-center justify-between text-xs font-mono text-slate-400">
                <span>STORAGE USED</span>
                <HardDrive className="w-4 h-4 text-purple-400" />
              </div>
              <div className="text-2xl font-mono font-bold text-slate-100">
                {diskUsage != null ? `${diskUsage}%` : '—'}{' '}
                <span className="text-sm font-normal text-slate-400">of {vmStatus?.bootVolumeGb ?? UNKNOWN} GB</span>
              </div>
              <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                <div
                  className="bg-purple-400 h-full transition-all duration-300"
                  style={{ width: `${diskUsage ?? 0}%` }}
                />
              </div>
            </div>

            <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 flex flex-col gap-2">
              <div className="flex items-center justify-between text-xs font-mono text-slate-400">
                <span>UPTIME & STATUS</span>
                <Activity className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="text-2xl font-mono font-bold text-emerald-400">
                {runState ?? UNKNOWN}
              </div>
              <span className="text-xs font-mono text-slate-400">
                {uptimeHours != null
                  ? `${processUptimeLabel(uptimeHours)} · instance uptime not probed`
                  : 'uptime UNKNOWN'}
              </span>
            </div>
          </div>

          {/* SSH Connection Helper */}
          <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 flex flex-col gap-2">
            <div className="flex items-center justify-between text-xs font-mono text-slate-400">
              <span className="flex items-center gap-2 text-cyan-400">
                <Terminal className="w-4 h-4" />
                SSH TERMINAL COMMAND (ARM VM ACCESS)
              </span>
              <span className="text-slate-500">Public IP: {publicIp ?? UNKNOWN}</span>
            </div>
            <div className="flex items-center justify-between gap-2 p-2.5 rounded-lg bg-slate-950 border border-slate-800 font-mono text-xs text-slate-200">
              <code>{sshCommand ?? `SSH target ${UNKNOWN} — server reported no address`}</code>
              <button
                onClick={handleCopySSH}
                className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center gap-1 text-[11px]"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>

          {/* Ingress Security Firewall Table.
              The server reports a rule's `active` as null unless a port probe
              actually observed it, and it never probes. An unprobed rule must
              not render as a pass, so the icon follows the observed state and
              the heading only claims zero accidental ingress when every rule
              carries a real observation. */}
          <div className="flex flex-col gap-2">
            <h3 className="text-xs font-mono uppercase tracking-wider text-slate-400 flex items-center justify-between">
              <span>Security Ingress Firewall Rules (Oracle VCN — declared)</span>
              {firewallSummary.verified ? (
                <span className="text-emerald-400 flex items-center gap-1">
                  <Lock className="w-3.5 h-3.5" />
                  Zero Accidental Ingress
                </span>
              ) : (
                <span className="text-amber-400 flex items-center gap-1">
                  <Lock className="w-3.5 h-3.5" />
                  Ingress NOT_PROBED ({firewallSummary.probedCount}/{firewallSummary.total} rules observed)
                </span>
              )}
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 font-mono text-xs">
              {vmStatus?.firewallRules.map((rule) => {
                const state = resolveFirewallRuleState(rule.active);
                return (
                  <div
                    key={rule.port}
                    className="p-3 rounded-lg bg-slate-900/60 border border-slate-800 flex items-center justify-between"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="px-1.5 py-0.5 rounded bg-slate-800 text-cyan-400 font-bold">
                          Port {rule.port}
                        </span>
                        <span className="text-slate-400">{rule.proto.toUpperCase()}</span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-1">{rule.label}</p>
                    </div>
                    {state === 'OBSERVED_OPEN' ? (
                      <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                    ) : state === 'OBSERVED_CLOSED' ? (
                      <X className="w-4 h-4 text-rose-400 shrink-0" />
                    ) : (
                      <span className="text-[10px] text-amber-400 shrink-0 font-bold">
                        {state}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Zero-Cost Reference Guidelines. These are the Always Free programme
              limits, not a verification of this instance: nothing here queries
              the Oracle billing/entitlement API, so the panel is labelled as a
              reference and the text describes programme policy ("within the
              Always Free allowance") rather than asserting our instance was
              checked. */}
          <div className="p-4 rounded-xl bg-emerald-950/30 border border-emerald-800/40 text-xs text-slate-300 flex flex-col gap-2">
            <span className="font-mono text-emerald-300 font-bold flex items-center gap-2">
              <ShieldCheck className="w-4 h-4" />
              ORACLE ALWAYS FREE ₹0 — PROGRAMME LIMITS (NOT VERIFIED FOR THIS INSTANCE)
            </span>
            <ul className="list-disc list-inside space-y-1 text-[11px] text-slate-300">
              <li>Ampere A1 Compute Shape provides up to 4 OCPUs and 24 GB RAM within the Always Free allowance.</li>
              <li>The Always Free boot volume allowance is up to 200 GB.</li>
              <li>Outbound bandwidth allowance is 10 TB / month.</li>
              <li>Always Free does not include paid databases or paid load balancers.</li>
            </ul>
            <p className="text-[10px] text-amber-400 font-mono">
              Billing entitlement for this instance is not queried by this server — treated as NOT_PROBED.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-slate-950 border-t border-slate-800 flex items-center justify-between text-xs font-mono text-slate-400">
          <span className="text-slate-500">OS: {vmStatus?.os ?? UNKNOWN}</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
