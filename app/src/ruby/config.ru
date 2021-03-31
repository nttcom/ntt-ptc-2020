require 'fileutils'
require 'time'
require_relative './app'

FileUtils.touch(File.join(File.dirname(__FILE__), 'TokenRevocationList.dat'))

run App
