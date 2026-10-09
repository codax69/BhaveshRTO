import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import toast from 'react-hot-toast';
import * as XLSX from 'xlsx';
import Pagination from '../components/Pagination';
import { useLayout } from '../context/LayoutContext';

const CATEGORY_LABELS = {
    transfer: 'Transfer',
    hpt: 'HPT',
    hpa: 'HPA',
    insurance: 'Insurance',
    permit: 'Permit',
    fitness: 'Fitness',
    tax: 'Tax',
    odit: 'Odit',
    other: 'Other',
    broker: 'Broker',
};

const CATEGORY_COLORS = {
    transfer: 'badge-info',
    hpt: 'badge-success',
    hpa: 'badge-warning',
    insurance: 'badge-info',
    permit: 'badge-success',
    fitness: 'badge-warning',
    tax: 'badge-danger',
    odit: 'badge-secondary',
    other: 'badge-secondary',
    broker: 'badge-primary',
};

const MONTH_LABELS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
];

export default function Brokers() {
    const [brokers, setBrokers] = useState([]);
    const [currentPage, setCurrentPage] = useState(1);
    const ITEMS_PER_PAGE = 10;
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [search, setSearch] = useState('');
    const [monthFrom, setMonthFrom] = useState('');
    const [monthTo, setMonthTo] = useState('');

    const [remarksModal, setRemarksModal] = useState(null);
    const [editingRemarkId, setEditingRemarkId] = useState(null);
    const [editingRemarkText, setEditingRemarkText] = useState('');
    const [savingRemark, setSavingRemark] = useState(false);
    const navigate = useNavigate();
    const { setHeaderActions } = useLayout();

    // Register top bar header actions
    useEffect(() => {
        setHeaderActions(
            <button className="btn btn-primary" onClick={() => navigate('/customers/new?type=broker')}>
                <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                Add Broker Record
            </button>
        );
        return () => setHeaderActions(null);
    }, [setHeaderActions, navigate]);

    const effectiveMonthRange = () => {
        let from = monthFrom;
        let to = monthTo;
        if (from && to && Number(from) > Number(to)) {
            [from, to] = [to, from];
        }
        return { from, to };
    };

    const loadBrokers = useCallback(async (showLoader = false) => {
        if (showLoader) {
            setLoading(true);
        } else {
            setRefreshing(true);
        }

        try {
            const params = new URLSearchParams();
            if (search) params.set('search', search);
            const { from, to } = effectiveMonthRange();
            if (from) params.set('month_from', from);
            if (to) params.set('month_to', to);
            params.set('is_broker', 'true');
            params.set('page_size', '10000');
            params.set('_refresh', Date.now().toString());

            const res = await api.get('/customers', { params });
            setBrokers(res.data.data);
        } catch {
            toast.error('Failed to load broker records');
        } finally {
            if (showLoader) {
                setLoading(false);
            } else {
                setRefreshing(false);
            }
        }
    }, [search, monthFrom, monthTo]);

    useEffect(() => {
        setCurrentPage(1);
    }, [search, monthFrom, monthTo]);

    useEffect(() => {
        loadBrokers(true);
        const refreshWhenVisible = () => {
            if (document.visibilityState === 'visible') loadBrokers();
        };
        document.addEventListener('visibilitychange', refreshWhenVisible);
        const refreshTimer = window.setInterval(loadBrokers, 5000);
        return () => {
            document.removeEventListener('visibilitychange', refreshWhenVisible);
            window.clearInterval(refreshTimer);
        };
    }, [loadBrokers]);

    const handleDelete = async (id, name) => {
        if (!window.confirm(`Delete broker record "${name}"? This cannot be undone.`)) return;
        try {
            await api.delete(`/customers/${id}`);
            toast.success('Broker record deleted');
            loadBrokers();
        } catch {
            toast.error('Delete failed');
        }
    };

    const handleDownloadExcel = () => {
        if (brokers.length === 0) {
            toast.error('No broker records to download.');
            return;
        }
        const rows = brokers.map((c) => ({
            'Broker Name': c.broker_name || '',
            'Customer Name': c.name,
            'Contact Number': c.contact_number,
            'Gadi Number': c.vehicle_number || '',
            'Date of Work': c.date_of_work ? new Date(c.date_of_work).toLocaleDateString('en-IN') : '',
            'RTO Name': c.rto_name || '',
            'RTO Agent Name': c.rto_agent_name || '',
            'Application Number': c.application_number || '',
            'City': c.city || '',
            'Case Type': c.case_type === 'mobile_otp' ? 'Mobile OTP' : c.case_type === 'aadhar_otp' ? 'Adhar OTP' : '',
            'Services': (c.categories?.length ? c.categories : [c.category])
                .map((cat) => CATEGORY_LABELS[cat] || cat).join(', '),
            'Total Amount': parseFloat(c.amount_total || 0),
            'Paid Amount': parseFloat(c.amount_paid || 0),
            'Pending Amount': parseFloat(c.amount_pending || 0),
            'Remark': c.latest_remark || c.notes || '',
        }));

        const sheet = XLSX.utils.json_to_sheet(rows);
        const book = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(book, sheet, 'Brokers');
        const { from: exportFrom, to: exportTo } = effectiveMonthRange();
        const monthPart = exportFrom || exportTo
            ? `-${MONTH_LABELS[Number(exportFrom || '1') - 1].slice(0, 3)}-${MONTH_LABELS[Number(exportTo || '12') - 1].slice(0, 3)}`
            : '';
        XLSX.writeFile(book, `brokers${monthPart}-${new Date().toISOString().slice(0, 10)}.xlsx`);
        toast.success(`Downloaded ${rows.length} broker record${rows.length !== 1 ? 's' : ''}.`);
    };

    const openRemarks = async (c) => {
        setEditingRemarkId(null);
        setRemarksModal({ customer: c, remarks: [], loading: true });
        try {
            const res = await api.get('/remarks');
            const remarks = (res.data.data || []).filter((r) => r.customer === c.id);
            setRemarksModal({ customer: c, remarks, loading: false });
        } catch {
            toast.error('Failed to load remarks.');
            setRemarksModal((prev) => (prev ? { ...prev, loading: false } : prev));
        }
    };

    const startEditRemark = (r) => {
        setEditingRemarkId(r.id);
        setEditingRemarkText(r.text);
    };

    const handleSaveRemark = async (r) => {
        if (!editingRemarkText.trim()) {
            toast.error('Remark text is required.');
            return;
        }
        setSavingRemark(true);
        try {
            const res = await api.patch(`/remarks/${r.id}`, { text: editingRemarkText.trim() });
            setRemarksModal((prev) => (prev ? {
                ...prev,
                remarks: prev.remarks.map((x) => (x.id === r.id ? res.data.data : x)),
            } : prev));
            toast.success('Remark updated.');
            setEditingRemarkId(null);
            loadBrokers();
        } catch {
            toast.error('Failed to update remark.');
        } finally {
            setSavingRemark(false);
        }
    };

    return (
        <div className="app-content">
            {/* Filters Bar */}
            <div className="card" style={{ marginBottom: 20 }}>
                <div className="card-body" style={{ padding: '14px 20px', display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                    <input
                        className="form-control"
                        style={{ maxWidth: 280 }}
                        placeholder="Search broker, customer, gadi, RTO, city..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />

                    <select
                        className="form-control"
                        style={{ maxWidth: 140 }}
                        value={monthFrom}
                        onChange={(e) => setMonthFrom(e.target.value)}
                    >
                        <option value="">From Month</option>
                        {MONTH_LABELS.map((label, index) => (
                            <option key={label} value={index + 1}>{label}</option>
                        ))}
                    </select>

                    <select
                        className="form-control"
                        style={{ maxWidth: 140 }}
                        value={monthTo}
                        onChange={(e) => setMonthTo(e.target.value)}
                    >
                        <option value="">To Month</option>
                        {MONTH_LABELS.map((label, index) => (
                            <option key={label} value={index + 1}>{label}</option>
                        ))}
                    </select>

                    {!(monthFrom === '1' && monthTo === '12') ? (
                        <button
                            className="btn btn-ghost"
                            style={{ whiteSpace: 'nowrap' }}
                            onClick={() => { setMonthFrom('1'); setMonthTo('12'); }}
                            title="Show everything entered this year"
                        >
                            Full Year
                        </button>
                    ) : (
                        <button
                            className="btn btn-ghost"
                            style={{ whiteSpace: 'nowrap', color: '#1e3a5f', fontWeight: 600 }}
                            onClick={() => { setMonthFrom(''); setMonthTo(''); }}
                            title="Clear month range"
                        >
                            Full Year ✕
                        </button>
                    )}

                    <span style={{ alignSelf: 'center', fontSize: 13, color: '#64748b' }}>
                        {brokers.length} broker record{brokers.length !== 1 ? 's' : ''}
                    </span>

                    <button
                        className="btn btn-primary"
                        style={{ marginLeft: 'auto' }}
                        onClick={handleDownloadExcel}
                        disabled={loading || brokers.length === 0}
                        title="Download broker records as Excel"
                    >
                        <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                            <polyline points="7 10 12 15 17 10" />
                            <line x1="12" y1="15" x2="12" y2="3" />
                        </svg>
                        Download Excel
                    </button>
                </div>
            </div>

            {/* Broker Table - Streamlined Essential Columns */}
            <div className="card">
                {loading ? (
                    <div style={{ padding: 60, textAlign: 'center' }}>
                        <div className="spinner" style={{ width: 32, height: 32, border: '3px solid #e2e8f0', borderTopColor: '#1e3a5f', margin: '0 auto' }} />
                    </div>
                ) : brokers.length === 0 ? (
                    <div className="empty-state">
                        <svg width="56" height="56" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                            <path d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                        </svg>
                        <h3>No broker records yet</h3>
                        <p>Click "Add Broker Record" to create your first broker entry.</p>
                    </div>
                ) : (
                    <div className="table-wrapper" style={{ opacity: refreshing ? 0.9 : 1, transition: 'opacity 0.2s ease' }}>
                        <table className="broker-table">
                            <colgroup>
                                <col style={{ width: '13%' }} />
                                <col style={{ width: '11%' }} />
                                <col style={{ width: '8%' }} />
                                <col style={{ width: '10%' }} />
                                <col style={{ width: '10%' }} />
                                <col style={{ width: '9%' }} />
                                <col style={{ width: '10%' }} />
                                <col style={{ width: '7%' }} />
                                <col style={{ width: '6%' }} />
                                <col style={{ width: '7%' }} />
                                <col style={{ width: '9%' }} />
                            </colgroup>
                            <thead>
                                <tr>
                                    <th>Broker Name</th>
                                    <th>Gadi No.</th>
                                    <th>Case</th>
                                    <th>Services</th>
                                    <th>Contact Number</th>
                                    <th>RTO Name</th>
                                    <th>Remark</th>
                                    <th>Total</th>
                                    <th>Paid</th>
                                    <th>Pending</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {brokers.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE).map((c) => (
                                    <tr key={c.id}>
                                        <td style={{ fontWeight: 600, whiteSpace: 'nowrap' }} title={c.broker_name || undefined}>
                                            {c.broker_name || '—'}
                                        </td>
                                        <td
                                            style={{ whiteSpace: 'nowrap', fontFamily: 'monospace', fontSize: 13, letterSpacing: 0.5, textTransform: 'uppercase' }}
                                            title={c.vehicle_number || undefined}
                                        >{c.vehicle_number || '—'}</td>
                                        <td style={{ whiteSpace: 'nowrap' }}>
                                            <span className={`badge ${c.case_type === 'aadhar_otp' ? 'badge-warning' : 'badge-info'}`}>
                                                {c.case_type === 'aadhar_otp' ? 'Adhar OTP' : 'Mobile OTP'}
                                            </span>
                                        </td>
                                        <td>
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                                                {(c.categories?.length ? c.categories : [c.category]).map((category) => (
                                                    <span key={category} className={`badge ${CATEGORY_COLORS[category] || 'badge-info'}`}>
                                                        {CATEGORY_LABELS[category] || category}
                                                    </span>
                                                ))}
                                            </div>
                                        </td>
                                        <td style={{ whiteSpace: 'nowrap' }}>{c.contact_number}</td>
                                        <td style={{ whiteSpace: 'nowrap' }} title={c.rto_name || undefined}>{c.rto_name || '—'}</td>
                                        <td>
                                            {c.remarks_count > 0 ? (
                                                <button
                                                    className="btn btn-ghost btn-sm"
                                                    onClick={() => openRemarks(c)}
                                                    title={c.latest_remark}
                                                    style={{ width: '100%', textAlign: 'left', justifyContent: 'flex-start' }}
                                                >
                                                    <span className="badge badge-warning" style={{ fontSize: 10, padding: '1px 6px' }}>{c.remarks_count}</span>
                                                    <span style={{ display: 'block', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                        {c.latest_remark}
                                                    </span>
                                                </button>
                                            ) : c.notes ? (
                                                <button
                                                    className="btn btn-ghost btn-sm"
                                                    onClick={() => openRemarks(c)}
                                                    title={c.notes}
                                                    style={{ width: '100%', textAlign: 'left', justifyContent: 'flex-start' }}
                                                >
                                                    <span style={{ display: 'block', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                        {c.notes}
                                                    </span>
                                                </button>
                                            ) : (
                                                <span style={{ color: '#94a3b8' }}>—</span>
                                            )}
                                        </td>
                                        <td style={{ whiteSpace: 'nowrap' }}>₹{parseFloat(c.amount_total || 0).toLocaleString('en-IN')}</td>
                                        <td style={{ color: '#059669', whiteSpace: 'nowrap' }}>₹{parseFloat(c.amount_paid || 0).toLocaleString('en-IN')}</td>
                                        <td style={{ color: parseFloat(c.amount_pending) > 0 ? '#dc2626' : '#059669', fontWeight: 600, whiteSpace: 'nowrap' }}>
                                            ₹{parseFloat(c.amount_pending || 0).toLocaleString('en-IN')}
                                        </td>
                                        <td style={{ whiteSpace: 'nowrap' }}>
                                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                                <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/customers/${c.id}/edit`)}>Edit</button>
                                                <button className="btn btn-danger-ghost btn-sm" onClick={() => handleDelete(c.id, `${c.broker_name || ''} (${c.name})`)} title="Delete">
                                                    <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                                        <polyline points="3 6 5 6 21 6" />
                                                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                                        <line x1="10" y1="11" x2="10" y2="17" />
                                                        <line x1="14" y1="11" x2="14" y2="17" />
                                                    </svg>
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
                {!loading && brokers.length > 0 && (
                    <Pagination
                        currentPage={currentPage}
                        totalItems={brokers.length}
                        pageSize={ITEMS_PER_PAGE}
                        onPageChange={setCurrentPage}
                    />
                )}
            </div>

            {/* Remarks modal */}
            {remarksModal && (
                <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setRemarksModal(null); }} style={{ zIndex: 1000 }}>
                    <div className="modal" style={{ maxWidth: 520, width: '100%', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }} onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3 className="modal-title">Remarks — {remarksModal.customer?.broker_name ? `${remarksModal.customer.broker_name} (${remarksModal.customer.name})` : remarksModal.customer?.name}</h3>
                            <button className="btn btn-ghost btn-sm" onClick={() => setRemarksModal(null)} aria-label="Close">
                                <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                                </svg>
                            </button>
                        </div>
                        <div className="modal-body" style={{ overflowY: 'auto' }}>
                            {remarksModal.loading ? (
                                <div style={{ display: 'flex', justifyContent: 'center', padding: 30 }}>
                                    <div className="spinner" style={{ width: 28, height: 28, border: '3px solid #e2e8f0', borderTopColor: '#1e3a5f' }} />
                                </div>
                            ) : remarksModal.remarks.length === 0 && !remarksModal.customer?.notes ? (
                                <div style={{ textAlign: 'center', padding: '24px 0', color: '#94a3b8' }}>
                                    No remarks for this broker record.
                                </div>
                            ) : (
                                <>
                                    {remarksModal.customer?.notes && (
                                        <div style={{
                                            padding: '12px 14px', borderRadius: 10, border: '1px solid #e2e8f0',
                                            background: '#f8fafc', marginBottom: 10,
                                        }}>
                                            <p style={{ margin: 0, fontSize: 14, color: '#0f172a', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{remarksModal.customer.notes}</p>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                                                <p style={{ margin: 0, fontSize: 11.5, color: '#94a3b8' }}>
                                                    {remarksModal.customer.created_at ? new Date(remarksModal.customer.created_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Saved remark'}
                                                </p>
                                                <button
                                                    className="btn btn-ghost btn-sm"
                                                    onClick={() => navigate(`/customers/${remarksModal.customer.id}/edit`)}
                                                    title="Edit in broker form"
                                                >
                                                    Edit
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                    {remarksModal.remarks.map((r) => (
                                    <div key={r.id} style={{
                                        padding: '12px 14px', borderRadius: 10, border: '1px solid #e2e8f0',
                                        background: '#f8fafc', marginBottom: 10,
                                    }}>
                                        {editingRemarkId === r.id ? (
                                            <>
                                                <textarea
                                                    className="form-control"
                                                    value={editingRemarkText}
                                                    onChange={(e) => setEditingRemarkText(e.target.value)}
                                                    rows={3}
                                                    autoFocus
                                                    disabled={savingRemark}
                                                    style={{ resize: 'vertical', minHeight: 70, fontSize: 14 }}
                                                />
                                                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 10 }}>
                                                    <button
                                                        className="btn btn-ghost btn-sm"
                                                        onClick={() => setEditingRemarkId(null)}
                                                        disabled={savingRemark}
                                                    >
                                                        Cancel
                                                    </button>
                                                    <button
                                                        className="btn btn-primary btn-sm"
                                                        onClick={() => handleSaveRemark(r)}
                                                        disabled={savingRemark || !editingRemarkText.trim()}
                                                    >
                                                        {savingRemark ? (
                                                            <><span className="spinner" style={{ borderColor: 'rgba(255,255,255,0.3)', borderTopColor: '#fff', width: 12, height: 12, marginRight: 6 }} />Saving...</>
                                                        ) : (
                                                            'Save'
                                                        )}
                                                    </button>
                                                </div>
                                            </>
                                        ) : (
                                            <>
                                                <p style={{ margin: 0, fontSize: 14, color: '#0f172a', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{r.text}</p>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                                                    <p style={{ margin: 0, fontSize: 11.5, color: '#94a3b8' }}>
                                                        {new Date(r.created_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                                    </p>
                                                    <button
                                                        className="btn btn-ghost btn-sm"
                                                        onClick={() => startEditRemark(r)}
                                                        title="Edit remark"
                                                    >
                                                        <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                                            <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
                                                        </svg>
                                                        Edit
                                                    </button>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                ))}
                                </>
                            )}
                        </div>
                        <div className="modal-footer" style={{ paddingTop: 14, borderTop: '1px solid #e2e8f0' }}>
                            <button className="btn btn-primary" onClick={() => setRemarksModal(null)}>Close</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
