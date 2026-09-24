import React, { useState, useEffect } from 'react';
import {
  X,
  Briefcase,
  Plus,
  FileCheck,
  Send,
  DollarSign,
  Clock,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
} from 'lucide-react';
import { FreelanceLead } from '../types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export const FreelancePipelineModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const [leads, setLeads] = useState<FreelanceLead[]>([]);
  const [selectedLead, setSelectedLead] = useState<FreelanceLead | null>(null);
  const [showNewLeadModal, setShowNewLeadModal] = useState<boolean>(false);
  const [clientName, setClientName] = useState<string>('');
  const [projectType, setProjectType] = useState<string>('AI Integration');
  const [rawRequirement, setRawRequirement] = useState<string>('');
  const [budgetAmount, setBudgetAmount] = useState<number>(65000);
  const [copied, setCopied] = useState<boolean>(false);

  useEffect(() => {
    if (isOpen) {
      fetchLeads();
    }
  }, [isOpen]);

  const fetchLeads = async () => {
    try {
      const res = await fetch('/api/freelance/leads');
      const data = await res.json();
      if (data.leads) {
        setLeads(data.leads);
        if (!selectedLead && data.leads.length > 0) {
          setSelectedLead(data.leads[0]);
        }
      }
    } catch (err) {
      console.warn('Failed to fetch leads:', err);
    }
  };

  const handleCreateLead = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/freelance/create-lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientName,
          projectType,
          rawRequirement,
          budgetAmount,
        }),
      });
      const data = await res.json();
      if (data.success) {
        fetchLeads();
        setSelectedLead(data.lead);
        setShowNewLeadModal(false);
        setClientName('');
        setRawRequirement('');
      }
    } catch (err) {
      console.warn('Create lead failed:', err);
    }
  };

  const handleUpdateStatus = async (leadId: string, status: any) => {
    try {
      const res = await fetch('/api/freelance/update-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId, status }),
      });
      const data = await res.json();
      if (data.success) {
        fetchLeads();
        if (selectedLead?.id === leadId) {
          setSelectedLead(data.lead);
        }
      }
    } catch (err) {
      console.warn('Update lead status failed:', err);
    }
  };

  const handleCopyQuotation = () => {
    if (selectedLead?.quotation) {
      const text = `PROPOSAL & QUOTATION
Client: ${selectedLead.clientName}
Project: ${selectedLead.projectType}
Total Price: ₹${selectedLead.quotation.totalPrice.toLocaleString()} (Timeline: ${selectedLead.quotation.timelineDays} Days)

Scope Summary:
${selectedLead.quotation.scopeSummary}

Milestones:
${selectedLead.quotation.milestones.map((m, i) => `${i + 1}. ${m.title} - ₹${m.price.toLocaleString()} (${m.days} days)`).join('\n')}`;
      navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in font-sans">
      <div className="bg-slate-900 border border-amber-800/50 rounded-2xl w-full max-w-5xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/80">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-amber-950 border border-amber-500/30 text-amber-400">
              <Briefcase className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-slate-100">Freelancing JARVIS Business Pipeline</h2>
                <span className="px-2 py-0.5 text-[11px] font-mono rounded bg-amber-950 text-amber-300 border border-amber-800">
                  Automated CRM
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Inquiry Capture ➔ Requirement Extraction ➔ Instant Quotation & Milestone Breakdown
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowNewLeadModal(true)}
              className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-slate-950 text-xs font-bold flex items-center gap-1.5 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              New Client Inquiry
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Pipeline Content */}
        <div className="flex-1 flex flex-col md:flex-row min-h-0 bg-slate-950/30">
          {/* Left: Leads List */}
          <div className="w-full md:w-5/12 border-r border-slate-800 p-4 overflow-y-auto flex flex-col gap-2.5 bg-slate-950/40">
            <div className="text-xs font-mono text-slate-400 uppercase tracking-wider mb-1">
              Active Client Inquiries ({leads.length})
            </div>

            {leads.map((lead) => {
              const isSelected = selectedLead?.id === lead.id;
              return (
                <button
                  key={lead.id}
                  onClick={() => setSelectedLead(lead)}
                  className={`p-3.5 rounded-xl text-left border transition-all flex flex-col gap-1.5 ${
                    isSelected
                      ? 'bg-amber-950/40 border-amber-500/50 shadow-md'
                      : 'bg-slate-900/60 border-slate-800 hover:bg-slate-800/60'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-100 truncate">{lead.clientName}</span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-amber-300">
                      ₹{lead.budgetEstimate.amount.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-slate-400">
                    <span>{lead.projectType}</span>
                    <span className="font-mono text-cyan-400">{lead.status}</span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Right: Selected Lead & Quotation Details */}
          {selectedLead ? (
            <div className="w-full md:w-7/12 p-6 overflow-y-auto flex flex-col gap-5 bg-slate-900/40">
              {/* Lead Summary */}
              <div className="flex flex-col gap-2 pb-4 border-b border-slate-800">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono px-2 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-800">
                    Source: {selectedLead.source}
                  </span>
                  <span className="text-xs font-mono text-slate-400">
                    {new Date(selectedLead.createdAt).toLocaleDateString()}
                  </span>
                </div>
                <h3 className="text-lg font-bold text-slate-100">{selectedLead.clientName}</h3>
                <p className="text-xs text-slate-300 bg-slate-950 p-3 rounded-lg border border-slate-800 italic">
                  "{selectedLead.rawRequirement}"
                </p>
              </div>

              {/* Instant Quotation Preview */}
              {selectedLead.quotation && (
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono uppercase tracking-wider text-slate-400">
                      JARVIS AI Generated Quotation
                    </span>
                    <button
                      onClick={handleCopyQuotation}
                      className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-mono flex items-center gap-1"
                    >
                      {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      {copied ? 'Copied' : 'Copy Quote'}
                    </button>
                  </div>

                  <div className="p-4 rounded-xl bg-slate-950 border border-amber-900/30 flex flex-col gap-3 font-mono text-xs">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                      <span className="text-slate-400">Total Project Estimate:</span>
                      <span className="text-lg font-bold text-amber-400">
                        ₹{selectedLead.quotation.totalPrice.toLocaleString()} INR
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-slate-300">
                      <span>Delivery Timeline:</span>
                      <span className="font-bold text-cyan-400">{selectedLead.quotation.timelineDays} Business Days</span>
                    </div>

                    <div className="text-slate-300 text-[11px] font-sans">
                      <span className="font-bold text-slate-400 block mb-1">Scope:</span>
                      {selectedLead.quotation.scopeSummary}
                    </div>

                    {/* Milestones */}
                    <div className="mt-2 flex flex-col gap-2">
                      <span className="text-slate-400 font-bold">Milestones & Payment Tranches:</span>
                      {selectedLead.quotation.milestones.map((m, idx) => (
                        <div
                          key={idx}
                          className="p-2 rounded bg-slate-900 border border-slate-800 flex items-center justify-between"
                        >
                          <span className="text-slate-200">
                            {idx + 1}. {m.title} ({m.days} days)
                          </span>
                          <span className="text-emerald-400 font-bold">₹{m.price.toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Status Update Actions */}
              <div className="flex items-center gap-2 pt-2">
                <span className="text-xs font-mono text-slate-400">Update Status:</span>
                <button
                  onClick={() => handleUpdateStatus(selectedLead.id, 'Quotation Sent')}
                  className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-cyan-300 text-xs font-mono"
                >
                  Quotation Sent
                </button>
                <button
                  onClick={() => handleUpdateStatus(selectedLead.id, 'In Progress')}
                  className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-amber-300 text-xs font-mono"
                >
                  In Progress
                </button>
                <button
                  onClick={() => handleUpdateStatus(selectedLead.id, 'Delivered & Closed')}
                  className="px-2.5 py-1 rounded bg-emerald-950 border border-emerald-800 text-emerald-300 text-xs font-mono"
                >
                  Delivered & Closed
                </button>
              </div>
            </div>
          ) : (
            <div className="w-full md:w-7/12 p-8 flex items-center justify-center text-slate-500 text-xs font-mono">
              Select a client lead to inspect the quotation.
            </div>
          )}
        </div>

        {/* Create Lead Modal Form Sub-Dialog */}
        {showNewLeadModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
            <form
              onSubmit={handleCreateLead}
              className="bg-slate-900 border border-amber-500/50 rounded-xl p-6 w-full max-w-lg flex flex-col gap-4 shadow-2xl"
            >
              <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                <h3 className="text-sm font-bold text-slate-100">Add Client Inquiry & Auto-Generate Quotation</h3>
                <button
                  type="button"
                  onClick={() => setShowNewLeadModal(false)}
                  className="text-slate-400 hover:text-slate-100"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-mono text-slate-400">Client / Company Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Nexa Dynamics Inc."
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-mono text-slate-400">Project Type</label>
                  <select
                    value={projectType}
                    onChange={(e) => setProjectType(e.target.value)}
                    className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100 focus:outline-none focus:border-amber-500"
                  >
                    <option value="AI Integration">AI Integration</option>
                    <option value="Full-Stack Web App">Full-Stack Web App</option>
                    <option value="Mobile Telegram Bot">Mobile Telegram Bot</option>
                    <option value="Cloud Migration">Cloud Migration</option>
                  </select>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-mono text-slate-400">Target Budget (₹ INR)</label>
                  <input
                    type="number"
                    value={budgetAmount}
                    onChange={(e) => setBudgetAmount(Number(e.target.value))}
                    className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100 focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-mono text-slate-400">Raw Client Requirement / Message</label>
                <textarea
                  rows={3}
                  required
                  placeholder="Paste client inquiry text here..."
                  value={rawRequirement}
                  onChange={(e) => setRawRequirement(e.target.value)}
                  className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowNewLeadModal(false)}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold rounded text-xs"
                >
                  Generate Quotation
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
};
