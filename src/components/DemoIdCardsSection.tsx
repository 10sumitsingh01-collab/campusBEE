'use client';

import React, { useEffect, useRef } from 'react';
import JsBarcode from 'jsbarcode';
import { Printer, ScanLine } from 'lucide-react';
import { CollegeIdCard } from '@/types/domain';

export function BarcodeSvg({ value }: { value: string }) {
  const svgRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    if (svgRef.current) {
      JsBarcode(svgRef.current, value, {
        format: 'CODE128',
        lineColor: '#111827',
        width: 2.0,
        height: 48,
        displayValue: true,
        fontSize: 12,
        margin: 6,
      });
    }
  }, [value]);

  return <svg ref={svgRef} className="w-full max-w-[220px] h-auto mx-auto" />;
}

interface DemoIdCardsSectionProps {
  cards: CollegeIdCard[];
  onQuickTestScan: (barcodeToken: string) => void;
}

export default function DemoIdCardsSection({
  cards,
  onQuickTestScan,
}: DemoIdCardsSectionProps) {
  if (cards.length === 0) return null;

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-6 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-[#4D4D4D]">
            Check-in practice cards
          </h3>
          <p className="text-xs text-[#717171]">
            Scan a barcode with the camera, print the cards, or
            click Test Scan.
          </p>
        </div>
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex items-center gap-1.5 text-xs px-3.5 py-2 rounded border border-gray-200 text-[#4D4D4D] hover:bg-gray-50 font-medium cursor-pointer self-start"
        >
          <Printer className="h-3.5 w-3.5" />
          Print cards
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((card) => (
          <div
            key={card.id}
            className="rounded-xl border border-gray-200 bg-[#F5F7FA] overflow-hidden flex flex-col justify-between"
          >
            <div className="bg-[#1C4980] text-white px-4 py-2.5 flex items-center justify-between">
              <span className="text-xs font-bold tracking-tight">
                campusBEE ID
              </span>
              <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded bg-white/15">
                Check-in practice
              </span>
            </div>

            <div className="p-4 space-y-2 bg-white flex-1 flex flex-col justify-between">
              <div>
                <p className="text-sm font-bold text-[#263238]">{card.name}</p>
                <p className="text-xs font-mono text-[#0073E6] font-semibold">
                  {card.usn ?? 'USN: NOT PROVIDED'}
                </p>
                <p className="text-[11px] text-[#717171]">
                  {card.department ? `${card.department}` : 'Dept: NOT PROVIDED'}
                  {card.year ? ` · Year ${card.year}` : ''}
                  {card.college ? ` · ${card.college}` : ''}
                </p>
              </div>

              <div className="pt-2 border-t border-gray-100">
                {card.barcodeToken ? (
                  <BarcodeSvg value={card.barcodeToken} />
                ) : (
                  <div className="py-4 text-center text-[11px] text-amber-700 bg-amber-50 rounded border border-amber-200">
                    Barcode not provided yet
                  </div>
                )}
              </div>
            </div>

            <div className="px-3 py-2 bg-[#F5F7FA] border-t border-gray-200 flex items-center justify-between">
              <span className="text-[10px] text-[#717171]">
                {card.usn === '1BY25CS055'
                  ? 'Not Registered (AI Hack)'
                  : 'Registered (AI Hack)'}
              </span>
              {card.barcodeToken ? (
                <button
                  type="button"
                  onClick={() => onQuickTestScan(card.barcodeToken!)}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-action hover:underline cursor-pointer"
                >
                  <ScanLine className="h-3 w-3" />
                  Test Scan
                </button>
              ) : (
                <span className="text-[10px] text-gray-400">Pending</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
