import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { SalesFilters } from '@/types/pharmacy-sales';
import { PharmacySaleStatus, SaleType } from "@/types/pharmacy";
import { CalendarIcon, Search, X, ListFilter, User, MapPin, Tag } from 'lucide-react';
import { format } from 'date-fns';

interface Props {
  onFilterChange: (filters: Partial<SalesFilters>) => void;
  onReset: () => void;
  locations?: Array<{ id: string; name: string }>;
}

export function PharmacySalesFilters({ onFilterChange, onReset, locations = [] }: Props) {
  const [dateFrom, setDateFrom] = useState<Date>();
  const [dateTo, setDateTo] = useState<Date>();
  const [activeFilters, setActiveFilters] = useState<string[]>([]);

  const handleFilterChange = (key: keyof SalesFilters, value: string | undefined) => {
    onFilterChange({ [key]: value === 'all' ? undefined : (value || undefined) });
    
    setActiveFilters(prev => 
      (value && value !== 'all') ? [...new Set([...prev, key])] : prev.filter(f => f !== key)
    );
  };

  const handleDateChange = (field: 'dateFrom' | 'dateTo', date?: Date) => {
    if (field === 'dateFrom') setDateFrom(date);
    else setDateTo(date);
    
    onFilterChange({ [field]: date?.toISOString() });
    setActiveFilters(prev => date ? [...new Set([...prev, field])] : prev.filter(f => f !== field));
  };

  const clearAll = () => {
    setDateFrom(undefined);
    setDateTo(undefined);
    setActiveFilters([]);
    onReset();
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Primary Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Search Input - Main Filter */}
        <div className="relative w-full md:w-64">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
          <Input 
            placeholder="Search patient or code..." 
            onChange={(e) => handleFilterChange('patientId', e.target.value)}
            className="pl-9 h-9 text-sm bg-white shadow-sm border-slate-200 focus-visible:ring-primary/20"
          />
        </div>

        {/* Location Dropdown */}
        {locations.length > 0 && (
          <Select onValueChange={(v) => handleFilterChange('locationId', v)}>
            <SelectTrigger className="w-[140px] h-9 text-sm bg-white border-slate-200">
              <div className="flex items-center gap-2 truncate">
                <MapPin className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                <SelectValue placeholder="Location" />
              </div>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Locations</SelectItem>
              {locations.map((loc) => (
                <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* Type Dropdown */}
        <Select onValueChange={(v) => handleFilterChange('saleType', v as SaleType)}>
          <SelectTrigger className="w-[130px] h-9 text-sm bg-white border-slate-200">
            <div className="flex items-center gap-2 truncate">
              <Tag className="h-3.5 w-3.5 text-slate-400 shrink-0" />
              <SelectValue placeholder="Type" />
            </div>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value={SaleType.WALK_IN}>Walk-in</SelectItem>
            <SelectItem value={SaleType.PRESCRIPTION}>Prescription</SelectItem>
          </SelectContent>
        </Select>

        {/* Status Dropdown */}
        <Select onValueChange={(v) => handleFilterChange('status', v as PharmacySaleStatus)}>
          <SelectTrigger className="w-[140px] h-9 text-sm bg-white border-slate-200">
            <div className="flex items-center gap-2 truncate">
              <ListFilter className="h-3.5 w-3.5 text-slate-400 shrink-0" />
              <SelectValue placeholder="Status" />
            </div>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {Object.values(PharmacySaleStatus).map((status) => (
              <SelectItem key={status} value={status} className="capitalize">
                {status.toLowerCase().replace('_', ' ')}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Unified Date Range (Visual) */}
        <div className="flex items-center bg-white border border-slate-200 rounded-md h-9 px-1">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" className="h-7 px-2 text-xs font-normal hover:bg-slate-100">
                <CalendarIcon className="mr-2 h-3 w-3 text-slate-400" />
                {dateFrom ? format(dateFrom, 'MMM d') : 'From'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={dateFrom}
                onSelect={(date) => handleDateChange('dateFrom', date)}
              />
            </PopoverContent>
          </Popover>
          <div className="h-4 w-[1px] bg-slate-200 mx-0.5" />
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" className="h-7 px-2 text-xs font-normal hover:bg-slate-100">
                {dateTo ? format(dateTo, 'MMM d') : 'To'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={dateTo}
                onSelect={(date) => handleDateChange('dateTo', date)}
                disabled={(date) => dateFrom ? date < dateFrom : false}
              />
            </PopoverContent>
          </Popover>
        </div>

        {/* Clear Button */}
        {activeFilters.length > 0 && (
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={clearAll} 
            className="h-9 px-3 text-slate-500 hover:text-red-600 hover:bg-red-50 transition-colors"
          >
            <X className="h-4 w-4 mr-1.5" />
            Reset
          </Button>
        )}
      </div>

      {/* Active Filter Badges - Slim Version */}
      {activeFilters.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mr-1">Active:</span>
          {activeFilters.map((filter) => (
            <Badge 
              key={filter} 
              variant="secondary" 
              className="bg-slate-100 text-slate-600 border-none hover:bg-slate-200 px-2 py-0 h-5 text-[11px] font-medium transition-all"
            >
              {filter.replace(/([A-Z])/g, ' $1').trim()}
              <button 
                onClick={() => handleFilterChange(filter as keyof SalesFilters, undefined)}
                className="ml-1.5 rounded-full hover:bg-slate-300 p-0.5"
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}