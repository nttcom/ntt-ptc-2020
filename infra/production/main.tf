variable "competition_vm_disk" {
  default = "prod-app-202009110910"
}

variable "bench_vm_disk" {
  default = "prod-bench-202009110910"
}

variable "num_competition_vm" {
  default = 150
}

variable "num_bench_vm" {
  # for test
  default = 50
}

variable "zone" {
  default = "asia-northeast1-b"
}

provider "google" {
  credentials = file("./gcloud-auth.key")
  project     = "sys0098096-1-80305617"
  region      = "asia-northeast1"
}

resource "google_compute_disk" "competition" {
  count    = var.num_competition_vm
  name     = format("prod-competition-%03d", count.index + 1)
  snapshot = var.competition_vm_disk
  zone     = var.zone
}

resource "google_compute_disk" "bench" {
  count    = var.num_bench_vm
  name     = format("prod-bench-%03d", count.index + 1)
  snapshot = var.bench_vm_disk
  zone     = var.zone
}

resource "google_compute_network" "nptc" {
  name                    = "nptc"
  project                 = "sys0098096-1-80305617"
  auto_create_subnetworks = false
}

resource "google_compute_subnetwork" "competition" {
  name   = "competition"
  region = "asia-northeast1"

  network       = google_compute_network.nptc.name
  ip_cidr_range = "10.100.0.0/16"
}

resource "google_compute_subnetwork" "management" {
  name   = "management"
  region = "asia-northeast1"

  network       = google_compute_network.nptc.name
  ip_cidr_range = "10.1.0.0/16"
}

resource "google_compute_firewall" "competition-internal" {
  name = "ptc-competition-internal"
  network = google_compute_network.nptc.name

  allow {
    protocol = "all"
  }

  source_ranges = [google_compute_subnetwork.competition.ip_cidr_range]

  target_tags = ["competition-vm"]
}

resource "google_compute_firewall" "ptc-competition" {
  name    = "ptc-competition"
  network = google_compute_network.nptc.name

  allow {
    protocol = "tcp"
    ports    = ["22", "80", "443"]
  }

  target_tags = ["competition-vm"]
}

resource "google_compute_firewall" "ptc-bench" {
  name    = "ptc-bench"
  network = google_compute_network.nptc.name

  allow {
    protocol = "tcp"
    ports    = ["22"]
  }

  source_ranges = [google_compute_subnetwork.management.ip_cidr_range]

  target_tags = ["bench-vm"]
}

resource "google_compute_instance" "competition" {
  count = var.num_competition_vm

  name         = format("competition-%03d", count.index + 1)
  machine_type = "n1-highcpu-2"
  zone         = var.zone
  tags         = ["competition-vm", "prod"]

  boot_disk {
    source = element(google_compute_disk.competition.*.self_link, count.index)
  }

  labels = {
    "type" = "app"
  }

  metadata = {
    "block-project-ssh-keys" = "true"
    "ssh-keys" = "ptc_admin:ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAILQCIIqKNMR2QMEWQ2uX2DRAJuqENvab/3ZmggmNl8l7 ptc_admin"
  }

  network_interface {
    network    = google_compute_network.nptc.name
    subnetwork = google_compute_subnetwork.competition.name
    network_ip = "10.100.1.${count.index + 1}"
    access_config {
    }
  }

  scheduling {
    preemptible       = false
    automatic_restart = false
  }
}

resource "google_compute_instance" "bench" {
  count = var.num_bench_vm

  name         = format("bench-%03d", count.index + 1)
  machine_type = "n1-highcpu-16"
  zone         = var.zone
  tags         = ["bench-vm", "prod"]

  boot_disk {
    source = element(google_compute_disk.bench.*.self_link, count.index)
  }

  labels = {
    "type" = "bench"
  }

  metadata = {
    "block-project-ssh-keys" = "true"
    "ssh-keys" = "ptc_admin:ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAILQCIIqKNMR2QMEWQ2uX2DRAJuqENvab/3ZmggmNl8l7 ptc_admin"
  }

  network_interface {
    network    = google_compute_network.nptc.name
    subnetwork = google_compute_subnetwork.management.name
    network_ip = "10.1.1.${count.index + 1}"
    access_config {
    }
  }

  scheduling {
    preemptible       = false
    automatic_restart = false
  }
}

output "debug" {
  value = "${google_compute_disk.competition}"
}
