import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminService, ModerationRule } from '../../../services/admin.service';

@Component({
  selector: 'app-admin-moderation',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-moderation.html',
  styleUrl: './admin-moderation.scss',
})
export class AdminModeration implements OnInit {
  private svc = inject(AdminService);

  rules    = signal<ModerationRule[]>([]);
  isLoading = signal(true);
  saving   = signal(false);
  error    = signal('');

  // New rule form
  newType        = 'blacklist';
  newPattern     = '';
  newDescription = '';
  showForm       = false;

  readonly RULE_TYPES = [
    { id: 'blacklist',   label: 'Blacklist',   desc: 'Bloque les messages contenant ce mot/phrase', color: 'var(--danger)', icon: '' },
    { id: 'warning',     label: 'Avertissement', desc: 'Affiche un avertissement à l\'utilisateur',  color: 'var(--accent)', icon: '' },
    { id: 'block_user',  label: 'Blocage user',  desc: 'Bloque automatiquement l\'utilisateur',      color: 'var(--text-primary)', icon: '' },
  ];

  ngOnInit() { this.load(); }

  load() {
    this.isLoading.set(true);
    this.svc.getModerationRules().subscribe({
      next: rules => { this.rules.set(rules); this.isLoading.set(false); },
      error: ()   => { this.isLoading.set(false); },
    });
  }

  get rulesByType(): { type: string; label: string; icon: string; color: string; desc: string; rules: ModerationRule[] }[] {
    return this.RULE_TYPES.map(t => ({
      type: t.id,
      label: t.label,
      icon: t.icon,
      color: t.color,
      desc: t.desc,
      rules: this.rules().filter(r => r.type === t.id),
    }));
  }

  toggleForm() { this.showForm = !this.showForm; }

  save() {
    if (!this.newPattern.trim()) { this.error.set('Le motif est requis.'); return; }
    this.saving.set(true);
    this.error.set('');
    this.svc.createModerationRule({
      type: this.newType,
      pattern: this.newPattern.trim(),
      description: this.newDescription.trim(),
    }).subscribe({
      next: rule => {
        this.rules.update(list => [rule, ...list]);
        this.newPattern = '';
        this.newDescription = '';
        this.showForm = false;
        this.saving.set(false);
      },
      error: () => { this.error.set('Erreur lors de la création.'); this.saving.set(false); },
    });
  }

  toggle(rule: ModerationRule) {
    this.svc.toggleModerationRule(rule.id).subscribe(r => {
      this.rules.update(list => list.map(x => x.id === r.id ? { ...x, is_active: r.is_active } : x));
    });
  }

  delete(rule: ModerationRule) {
    if (!confirm(`Supprimer la règle "${rule.pattern}" ?`)) return;
    this.svc.deleteModerationRule(rule.id).subscribe(() => {
      this.rules.update(list => list.filter(r => r.id !== rule.id));
    });
  }

  typeInfo(type: string) {
    return this.RULE_TYPES.find(t => t.id === type) ?? { label: type, color: 'var(--text-muted)', icon: '', desc: '' };
  }

  formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString('fr-GN', { day: '2-digit', month: 'short', year: 'numeric' });
  }
}
